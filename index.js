var CQRS = (function(){
	function getWorkerThatExecutedFunction(workerFn, ...args){
		var workerFnUrl = URL.createObjectURL(new Blob([`(${workerFn.toString()}).apply(null, ${JSON.stringify(args)})`], {type: "application/javascript"}));
		var worker = new Worker(workerFnUrl);
		return worker;
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
			resolve(e.data);
			worker.terminate();
		};
		worker.onerror = function(e){
			reject(e.error);
		};
		worker.postMessage(undefined);
		return promise;
	}
	function getQueryExecuter(queryName){
		return function(){};
	}
	function getCommandExecuter(commandName){
		return function(){};
	}
	var CQRS = {
		async create(url){
			url = new URL(url, location.href).toString();
			var definition = await getStateDefinition(url);
			var result = {};
			for(var queryName of definition.queryNames){
				result[queryName] = getQueryExecuter(queryName);
			}
			for(var commandName of definition.commandNames){
				result[commandName] = getCommandExecuter(commandName);
			}
			return result;
		}
	};

	return CQRS;
})()