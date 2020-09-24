var step;

onCommand('setStep', s => {
	step = s;
});

onQuery('getStep', index => {
	return step * index;
});