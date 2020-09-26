//console.log(`this:`, this)
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
	return new Promise((res) => {
		var delay = Math.floor(20 + 40 * Math.random());
		setTimeout(function(){
			res({result: index * step, delay: delay});
		}, delay)
	})
});

onExportState(() => step);

onImportState(s => {
	return new Promise((res) => setTimeout(() => {
		step = s;
		console.log(`finished importing new state`)
		res();
	}, 20))
	//step = s;
})