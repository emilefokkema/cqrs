var CQRS = (function(){
	function getWorkerThatExecutedFunction(workerFn, ...args){
		var workerFnUrl = URL.createObjectURL(new Blob([`(${workerFn.toString()}).apply(null, ${JSON.stringify(args)})`], {type: "application/javascript"}));
		var worker = new Worker(workerFnUrl);
		return worker;
	}
	var requestId = 0;
	class CancellationToken{
		constructor(){
			this.cancelled = false;
			this.onCancelledHandlers = [];
		}
		cancel(){
			if(this.cancelled){
				return;
			}
			this.cancelled = true;
			for(var handler of this.onCancelledHandlers){
				handler();
			}
			this.onCancelledHandlers = [];
		}
		onCancelled(handler){
			if(this.cancelled){
				handler();
				return;
			}
			this.onCancelledHandlers.push(handler);
		}
	}
	class WorkerRequest{
		constructor(methodName, args, cancellationToken){
			this.requestId = requestId++;
			this.cancellationToken = cancellationToken;
			this.args = args;
			this.methodName = methodName;
			var self = this;
			this.promise = new Promise(function(res, rej){
				self.resolve = res;
				self.reject = rej;
			});
		}
		get cancelled(){return !!this.cancellationToken && this.cancellationToken.cancelled;}
	}
	class WorkerWrapper{
		constructor(url){
			this.url = url;
			this.worker = undefined;
			this.workerInitialized = false;
			this.busy = false;
		}
		async whenFree(){

		}
		initializeWorker(){

		}
	}
	class WorkerPool{
		constructor(url, number){
			this.number = number;
			this.workers = [];
			this.commands = [];
			this.queries = [];
			this.url = url;
		}
		async executeNext(){
			if(this.commands.length > 0){
				var commandToExecute = this.commands.splice(0, 1)[0];
				
			}
		}
		getAvailableWorker(){
			for(var i = 0; i < this.workers.length; i++){
				if(!this.workers[i].busy){
					return this.workers[i];
				}
			}
			if(this.workers.length < this.number){
				var newWorker = new WorkerWrapper(this.url);
				this.workers.push(newWorker);
				return newWorker;
			}
		}
		removeCommand(request){
			var index = this.commands.indexOf(request);
			if(index > -1){
				this.commands.splice(index, 1);
				console.log(`removed command with id ${request.requestId}`);
			}
		}
		removeQuery(request){
			var index = this.queries.indexOf(request);
			if(index > -1){
				this.queries.splice(index, 1);
				console.log(`removed query with id ${request.requestId}`);
			}
		}
		dequeueCommand(){
			if(this.commands.length === 0){
				return;
			}
			return this.commands.splice(0, 1)[0];
		}
		enqueueCommand(commandName, args){
			var command = new WorkerRequest(commandName, args);
			this.commands.push(command);
			console.log(`enqueued command with id ${command.requestId}`);
			return command;
		}
		enqueueQuery(queryName, args, cancellationToken){
			var query = new WorkerRequest(queryName, args, cancellationToken);
			if(cancellationToken){
				cancellationToken.onCancelled(() => this.removeQuery(query))
			}
			this.queries.push(query);
			console.log(`enqueued query with id ${query.requestId}`);
			return query;
		}
		executeQuery(queryName, args, cancellationToken){
			//console.log(`worker pool going to execute query '${queryName}' with args `, args);
			var query = this.enqueueQuery(queryName, args, cancellationToken);
			this.executeNext();
			return query.promise;
		}
		executeCommand(commandName, args){
			if(this.queries.length > 0 || this.commands.length > 0){
				throw 'Cannot execute command when there are commands or queries pending'
			}
			//console.log(`worker pool going to execute command '${commandName}' with args `, args);
			var command = this.enqueueCommand(commandName, args);
			this.executeNext();
			return command.promise;
		}
	}

	function getStateDefinition(url){
		var resolve, reject, promise = new Promise(function(res, rej){resolve = res;reject = rej;});
		var worker = getWorkerThatExecutedFunction(function(url){
			var queryNames = [], commandNames = [];
			onCommand = function(commandName){
				commandNames.push(commandName);
			};
			onQuery = function(queryName){
				queryNames.push(queryName);
			};
			importScripts(url);
			onmessage = function(){
				postMessage({
					queryNames: queryNames,
					commandNames: commandNames
				});
			};
		}, url);
		worker.onmessage = function(e){
			worker.terminate();
			resolve(e.data);
		};
		worker.onerror = function(e){
			reject(e.error);
		};
		worker.postMessage(undefined);
		return promise;
	}
	function getArgsAndCancellationToken(args){
		var otherArgs = [];
		var cancellationToken;
		for(var i = 0; i < args.length; i++){
			var arg = args[i];
			if(arg instanceof CancellationToken){
				if(i < args.length - 1){
					throw 'Please put the cancellation token last in the list of arguments'
				}
				cancellationToken = arg;
			}else{
				otherArgs.push(arg);
			}
		}
		return {otherArgs, cancellationToken};
	}
	function getQueryExecuter(queryName, workerPool){
		return function(...args){
			var separated = getArgsAndCancellationToken(args);
			return workerPool.executeQuery(queryName, separated.otherArgs, separated.cancellationToken);
		};
	}
	function getCommandExecuter(commandName, workerPool){
		return function(...args){
			if(args.some(a => a instanceof CancellationToken)){
				throw 'cancellation is not supported when executing a command'
			}
			return workerPool.executeCommand(commandName, args);
		};
	}
	var CQRS = {
		async create(url, numberParallel){
			url = new URL(url, location.href).toString();
			var definition = await getStateDefinition(url);
			var result = {};
			var pool = new WorkerPool(url, numberParallel);
			for(var queryName of definition.queryNames){
				result[queryName] = getQueryExecuter(queryName, pool);
			}
			for(var commandName of definition.commandNames){
				result[commandName] = getCommandExecuter(commandName, pool);
			}
			return result;
		},
		CancellationToken: CancellationToken
	};

	return CQRS;
})()