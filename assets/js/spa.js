var theData = {};

function formatBytes(a,b=2){if(0===a)return"0 Bytes";const c=0>b?0:b,d=Math.floor(Math.log(a)/Math.log(1024));return parseFloat((a/Math.pow(1024,d)).toFixed(c))+" "+["Bytes","KB","MB","GB","TB","PB","EB","ZB","YB"][d]}

function colorchange() {
    if (theData._coord._data._color === null &&
        !document.getElementById('scales').checked) return;

    theData._coord.options.draw.mode =
        (document.getElementById('scales').checked) ?
            "cluster" :
            "print";

    theData._coord.options.skip.dims.mode = "show";
    theData._coord.options.skip.dims.values = theData._coord._data._graph_features;

    theData._coord.updateData("ParallelCoordinatesGraph",
        theData._currentData.features,
        theData._currentData.objects,
        (document.getElementById('scales').checked) ?
            $('#color_selector').val() :
            null,
        null);
}

function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    var files = (evt.type === "change") ? evt.target.files : evt.dataTransfer.files; // FileList object.

    // files is a FileList of File objects. List some properties.
    var output = [];
    for (var i = 0, f; f = files[i]; i++) {
        output.push('<li><strong>', escape(f.name), '</strong> (', f.type || 'n/a', ') - ',
            f.size, ' bytes, last modified: ',
            f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
            '</li>');

        theData._file_info = {
            name: f.name,
            type: f.type,
            size: f.size,
            dateModified: f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
            dateLoaded: Intl.DateTimeFormat('en-GB', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric'
                }).format(Date.now()),
        };

        Papa.parse(f, {
            worker: true,
            skipEmptyLines: true,
            complete: function (results) {
                theData._papa_raw = results;

                let data ={
                    file: theData._file_info,
                    features: results.data[0],
                    objects: results.data.filter((x, i) => i > 0)
                };

                let latest = [JSON.stringify(data)];

                for(let i = 0; i < 5; i++)
                    if(localStorage.getItem('latest_data' + i) !== null) {
                        latest.push(localStorage.getItem('latest_data' + i));
                        localStorage.removeItem('latest_data' + i);
                    }

                latest.filter((x, i) => {
                    if (i === 0) return true;
                    let obj = JSON.parse(x);

                    return !(data.features.every((y, j) => y === obj.features[j]) &&
                        data.objects.length === obj.objects.length &&
                        data.objects.every((y, j) =>
                            y.every((z, l) => z === obj.objects[j][l])));
                }).forEach((x, i) => {
                    try {
                        if (i < 5) localStorage.setItem('latest_data' + i, x);
                    }
                    catch (e) {
                        let obj = JSON.parse(x);
                        console.log('Internal browser storage size exceeded, ' +
                            'skipping file "' + obj.file.name + '" save.');
                    }
                });

                loadData(data);
            }
        });
    }
}

function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

function loadData(data){
    theData._currentData = data;

    theData._coord = new ParallelCoordinates("ParallelCoordinatesGraph",
        data.features,
        data.objects,
        null,
        null);

    d3.select('#color_div')
        .append('select')
        .attr({
            'class': 'select',
            'id': 'color_selector'
        });

    $('#color_selector').select2({
        closeOnSelect: true,
        data: data.features.map((d) => {
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