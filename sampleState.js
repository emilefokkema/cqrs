var step;

onCommand('setStep', s => {
	console.log(`sample state going to set step from ${step} to`, s);
	return new Promise((res, rej) => {setTimeout(() => {
		
		
		if(s === 2){
			rej(`state cannot be set to 2`)
		}else{
			step = s;
			res();
		}
		
	}, 1000)})
});

onQuery('getStep', index => {
	return new Promise((res) => {setTimeout(function(){res(index * step);}, Math.floor(100 + 500 * Math.random()))})
});

onExportState(() => step);

onImportState(s => {
	console.log(`setting step from ${step} to `, s);
	step = s;
})