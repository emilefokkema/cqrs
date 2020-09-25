var CQRS = (function(){
	function getWorkerThatExecutedFunction(workerFn, ...args){
		var workerFnUrl = URL.createObjectURL(new Blob([`(${workerFn.toString()}).apply(null, ${JSON.stringify(args)})`], {type: "application/javascript"}));
		var worker = new Worker(workerFnUrl);
		return worker;
	}
	var requestId = 0;
	var workerId = 0;
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
			this.workerId = workerId++;
			this.url = url;
			this.worker = undefined;
			this.workerInitialized = false;
			this.busy = false;
			this.currentRequest = undefined;
		}
		async ensureWorkerInitialized(){
			if(this.worker){
				return;
			}
			var self = this;
			this.worker = getWorkerThatExecutedFunction(function(workerId, url){
				var commandHandlers = {}, queryHandlers = {};
				onCommand = function(commandName, handler){
					commandHandlers[commandName] = handler;
				};
				onQuery = function(queryName, handler){
					queryHandlers[queryName] = handler;
				};
				importScripts(url);
				onmessage = function(e){
					var data = e.data;
					if(data.commandName){
						var handler = commandHandlers[data.commandName];
						try{
							var result = handler.apply(null, data.args);
							if(result instanceof Promise){
								result.then((r) => postMessage({result: r})).catch((e) => postMessage({error: e}))
							}else{
								postMessage({result: result})
							}
						}catch(e){
							postMessage({error:e});
						}
					}
				};
			}, this.workerId, this.url);
			this.worker.onmessage = function(e){
				var data = e.data;
				if(data.error){
					self.currentRequest.reject(data.error);
				}else{
					self.currentRequest.resolve(data.result);
				}
			};
		}
		async executeCommand(command){
			console.log(`worker ${this.workerId} going to execute command '${command.methodName}', args `, command.args);
			this.busy = true;
			this.currentRequest = command;
			this.ensureWorkerInitialized();
			this.worker.postMessage({commandName: command.methodName, args: command.args});
			try{
				await command.promise;
			}finally{
				this.busy = false;
			}
		}
	}
	class WorkerPool{
		constructor(url, number){
			this.number = number;
			this.workers = [];
			this.queries = [];
			this.url = url;
			this.executingCommand = false;
		}
		async executeNext(){
			if(this.executingCommand){
				return;
			}
			this.ensureOneWorker();
			if(this.queries.length > 0){
				console.log(`going to execute queries`)
			}
		}

		ensureOneWorker(){
			if(this.workers.length === 0){
				this.workers.push(new WorkerWrapper(this.url));
			}
		}
		getAvailableWorkers(number){
			var result = [];
			while(result.length < number){
				var availableWorker = this.getAvailableWorker();
				if(!availableWorker){
					return result;
				}
				result.push(availableWorker);
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
		removeQuery(request){
			var index = this.queries.indexOf(request);
			if(index > -1){
				this.queries.splice(index, 1);
				console.log(`removed query with id ${request.requestId}`);
			}
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
		async executeCommand(commandName, args){
			if(this.workers.some(w => w.busy)){
				throw 'Cannot execute command when there are commands or queries pending'
			}
			this.executingCommand = true;
			// if(this.queries.length > 0 || this.commands.length > 0){
			// 	throw 'Cannot execute command when there are commands or queries pending'
			// }
			//console.log(`worker pool going to execute command '${commandName}' with args `, args);
			
			this.ensureOneWorker();
			try{
				await Promise.all(this.workers.map(w => w.executeCommand(new WorkerRequest(commandName, args))));
			}finally{
				this.executingCommand = false;
			}
			this.executeNext();
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