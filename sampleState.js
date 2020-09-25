var step;

onCommand('setStep', s => {
	console.log(`sample state going to set step `, s);
	return new Promise((res, rej) => {setTimeout(() => {
		step = s;
		
		if(s === 2){
			console.log(`sample state cannot set step to `, s);
			rej('a')
		}else{
			console.log(`sample state finished setting step`);
			res();
		}
		
	}, 1000)})
});

onQuery('getStep', index => {
	return new Promise((res) => {setTimeout(function(){res(index * step);}, 1000)})
});