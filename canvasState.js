var width, height, centerX, centerY, tileSize, tiles = [], widthAndHeightSet = false;

function createTiles(){
	tiles = [];
	var nCols = Math.ceil(width / tileSize);
	var nRows = Math.ceil(height / tileSize);
	for(var row = 0; row < nRows; row++){
		for(var col = 0; col < nCols; col++){
			tiles.push({row, col});
		}
	}
}

function getColor(x, y){
	var dx = x - centerX, dy = y - centerY, d = Math.sqrt(dx * dx + dy * dy);
	var r = Math.floor(255 * Math.pow(0.5, d / 100) * (1 + Math.sin(d / 5)) / 2);
	return [r, 0, 0, 255];
}

onQuery('getPixels', (tile) => {
	var length = 4 * tileSize * tileSize;
	var array = new Uint8ClampedArray(length);
	for(var tileRow = 0; tileRow < tileSize; tileRow++){
		for(var tileCol = 0; tileCol < tileSize; tileCol++){
			var arrayIndexRed = 4 * (tileRow * tileSize + tileCol);
			var x = tile.col * tileSize + tileCol;
			var y = tile.row * tileSize + tileRow;
			var [r, g, b, a] = getColor(x, y);
			array[arrayIndexRed] = r;
			array[arrayIndexRed + 1] = g;
			array[arrayIndexRed + 2] = b;
			array[arrayIndexRed + 3] = a;
		}
	}
	return new Promise((res) => {
		setTimeout(() => {
			res(array.buffer);
		}, 10);
	})
	//return array.buffer;
}, true);

onQuery('getTiles', () => {
	return tiles;
});

onCommand('setWidthAndHeight', (w, h) => {
	width = w;
	height = h;
	widthAndHeightSet = true;
});

onCommand('setTileSize', (s) => {
	if(!widthAndHeightSet){
		throw 'Please set width and height first'
	}
	tileSize = s;
	createTiles();
});

onCommand('setCenter', (x, y) => {
	centerX = x;
	centerY = y;
});

onExportState(() => {
	return {width, height, centerX, centerY, tileSize, tiles};
});

onImportState(s => {
	({width, height, centerX, centerY, tileSize, tiles} = s);
	widthAndHeightSet = true;
});