var theData = {};

function colorchange(){
	if (theData._coord._color === null &&
		!document.getElementById('scales').checked) return;

	theData._coord.options.draw.mode =
		(document.getElementById('scales').checked) ?
			"cluster" :
			"print";

	theData._coord.options.skip.dims.mode = "show";
	theData._coord.options.skip.dims.values = theData._coord._graph_features;

	theData._coord.updateData("ParallelCoordinatesGraph",
			theData._dimNames,
			theData._realData,
			(document.getElementById('scales').checked)?
				$('#color_selector').val():
				null,
			null);
}

function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    var files = (evt.type === "change")? evt.target.files: evt.dataTransfer.files; // FileList object.
	
    // files is a FileList of File objects. List some properties.
    var output = [];
    for (var i = 0, f; f = files[i]; i++) {
      output.push('<li><strong>', escape(f.name), '</strong> (', f.type || 'n/a', ') - ',
                  f.size, ' bytes, last modified: ',
                  f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
                  '</li>');
		
		Papa.parse(f, {
			worker: true,
			skipEmptyLines: true,
			complete: function(results) {
				theData._papa_raw = results;
				theData._dimNames = theData._papa_raw.data[0];
				theData._realData = theData._papa_raw.data.
										filter((x, i)=> i > 0);
					
				theData._coord = new ParallelCoordinates("ParallelCoordinatesGraph",
                    theData._dimNames,
                    theData._realData,
                    null,
                    null);
					
				d3.select('#color_div')
				.append('select')
					.attr({'class': 'select',
							'id': 'color_selector'});
					
				$('#color_selector').select2({
					closeOnSelect: true,
					data: theData._dimNames.map((d) => {
						return {id: d, text: d};
					}),
					width: '400px'
				})
					.on("change.select2", () => {
						colorchange();
					});

				d3.select('#first-page').style('display', 'none');
				d3.select('#after-load').style('display', 'flex');
			}
		});
    }
}

function handleDragOver(evt) {
	evt.stopPropagation();
	evt.preventDefault();
	evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}