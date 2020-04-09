// Add spaces and a dot to the number
// '1234567.1234 -> 1 234 567.12'
function numberWithSpaces(x) {
    let parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(".");
}

// RGB color object to hex string
function rgbToHex(color) {
  return "#" + ((1 << 24) + (color.r * 255 << 16) + (color.g * 255 << 8)
      + color.b * 255).toString(16).slice(1);
}

/**
 * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
 *
 * @param {String} text The text to be rendered.
 * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
 *
 * @see https://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
 */
function getTextWidth(text, font) {
    // re-use canvas object for better performance
    let canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    let context = canvas.getContext("2d");
    context.font = font;
    let metrics = context.measureText(text);
    return metrics.width;
}



class ParallelCoordinates {
    // ********
    // Constructor
    // 
    // Passes all arguments to updateData(...)
    // ********
    constructor(element_id, dimension_names, data_array, clusters_list, clusters_color_scheme, options = {}) {
        // Save the time for debug purposes
        this._timeStart =  Date.now();


        // This function allows to jump to a certain row in a DataTable
        $.fn.dataTable.Api.register('row().show()', function () {
            let page_info = this.table().page.info(),
            // Get row index
                new_row_index = this.index(),
            // Row position
                row_position = this.table().rows()[0].indexOf(new_row_index);
            // Already on right page ?
            if (row_position >= page_info.start && row_position < page_info.end) {
                // Return row object
                return this;
            }
            // Find page number
            let page_to_display = Math.floor(row_position / this.table().page.len());
            // Go to that page
            this.table().page(page_to_display);
            // Return row object
            return this;
        });


        // This is used to manipulate d3 objects
        // e.g., to move a line on a graph to the front
        // https://github.com/wbkd/d3-extended
        d3.selection.prototype.moveToFront = function () {
            return this.each(function () {
                this.parentNode.appendChild(this);
            });
        };
        d3.selection.prototype.moveToBack = function () {
            return this.each(function () {
                let firstChild = this.parentNode.firstChild;
                if (firstChild) {
                    this.parentNode.insertBefore(this, firstChild);
                }
            });
        };


        // Ability to count a number of a certain element in an array
        if (!Array.prototype.hasOwnProperty('count'))
            Object.defineProperties(Array.prototype, {
                count: {
                    value: function (value) {
                        return this.filter(x => x == value).length;
                    }
                }
            });


        // Update data and draw the graph
        if (arguments.length > 0) 
        {
            this.updateData(element_id, dimension_names, data_array, clusters_list, clusters_color_scheme, options);

            if (this._debug)
                console.log("Parallel Coordinates creation finished in %ims", Date.now() - this._timeStart);
        }
    }

    // ********
    // Data loading function
    // 
    // Parameters:
    //  element_id - DOM id where to attach the Parallel Coordinates
    //  feature_names - array with feature names
    //  data_array - array with all data about objects under consideration
    //  clusters_list - array with all clusters in those data
    //  clusters_color_scheme - array with the color scheme
    //  aux_features - auxillary features that are not presented on the graph   -- removed
    //  aux_data_array - auxillaty data                                         -- removed
    //  options - graph options
    //
    // ********
    updateData(element_id, feature_names, data_array, clusters, clusters_color_scheme, options = {}) {
        // Save the time for debug purposes
        this._timeUpdate =  Date.now();

        // Store the new values
        this.element_id = element_id;

        // Update arrays
        this._features = feature_names;
        this._data = data_array;
        this._color = clusters;
        this._color_scheme = clusters_color_scheme;
        //this._aux_features = aux_features;
        //this._aux_data = aux_data_array;

        // Debug statistics counters
        this._search_quantity = 0;
        this._search_time = 0;
        this._search_time_min = -1;
        this._search_time_max = -1;

        // If options does not have 'draw' option, make default one
        if (!options.hasOwnProperty('draw') &&
            (typeof this.options === 'undefined' ||
                !this.options.hasOwnProperty('draw'))) {
            options.draw = {
                framework: "d3",    // Possible values: 'd3'. todo: remove 'plotly' back
                mode: "print",       // Possible values: 'print', 'cluster'
                //, first_column_name: "Clusters"    // Custom name for 'clusters' tab in the table
                parts_visible: {
                    table: true,
                    cluster_table: true,
                    hint: true,
                    selector: true,
                    table_colvis: true
                }
            };

            this.options = options;
        }
        else if (typeof this.options === 'undefined') this.options = options;
            else if (options.hasOwnProperty('draw')) this.options.draw = options.draw;

        // Throw an error if a wrong draw mode selected
        if (!["print", "cluster"].includes(this.options.draw['mode'])) 
            throw "Wrong mode value! Possible values: 'print', 'cluster', got: '"+ value + "'";

        ////// todo: options.draw.parts_visible checks
            
        // If options does not have 'skip' option, make default one
        // Default is to show 6 first lanes
        if (!options.hasOwnProperty('skip') && !this.options.hasOwnProperty('skip'))
            options.skip = {
                dims: {
                    mode: "show", // Possible values: 'hide', 'show', 'none'
                    values: this._features.slice(0,
                        (this._features.length >= 5) ? 5 : this._features.length),
                    strict_naming: true
                }
            };
        else if (options.hasOwnProperty('skip')) this.options.skip = options.skip;

        // todo: options.skip checks

        // Check debug settings
        if (options.hasOwnProperty('debug')) this._debug = options.debug;
            else if (!this.hasOwnProperty('_debug')) this._debug = false;

        // Initiate the arrays and draw the stuff
        this._prepareGraphAndTables();

        // Show update time when debug enabled
        if (this._debug)
            console.log("Parallel Coordinates updated in %ims (%ims from creation)",
                Date.now() - this._timeUpdate, Date.now() - this._timeStart);

        //console.log(this);
    }
    
    _prepareGraphAndTables() {
        // A link to this ParCoord object
        var _PCobject = this;

        // Clear the whole div if something is there
        $("#" + this.element_id).empty();

        // A selectBox with chosen features
        if (this.options.draw.parts_visible.selector)
            d3.select("#" + this.element_id)
                .append('p')
                    .text('Select the features displayed on the Parallel Coordinates graph:')

                    .append('select')
                        .attr({'class': 'select',
                                'id': 's' + this.element_id});

        let has_empty = this.options.skip['dims'].strict_naming ||
            this.options.skip['dims'].values.some(x => x === "");

        // Construct the list with dimentions on graph
        this._graph_features = this._features.filter(elem => {
            let skip = this.options.skip;

            if (!('dims' in skip)) return true;
            if (skip['dims'].mode === 'none') return true;
            if (skip['dims'].mode === 'show'){
                if (has_empty && elem === "") return true;
                    else if (elem === "") return false;

                if (skip['dims'].strict_naming) {
                    if (skip['dims'].values.some(x => x === elem)) return true;
                }
                else if (skip['dims'].values.some(x => (x !== "") && (x.includes(elem) || elem.includes(x))))
                    return true;
            }

            return skip['dims'].mode === 'hide' &&
                !skip['dims'].values.some(x => (x.includes(elem) || elem.includes(x)));
        });

        // Reference array with all values as strings
        this._ids = this._data.map((row) => row.map(String));

        // Transposed data for future work
        this._values = this._data[0].map((col, i) => this._data.map(row => row[i]));

        // Arrays with numbers-only and string data parts
        this._features_numbers = this._features.filter((name, i) => this._values[i].every(x => !isNaN(x)));
        this._features_strings = this._features.filter((name) => !this._features_numbers.includes(name));

        // Coloring modes if clustering enabled
        if (this.options.draw.mode === "cluster")
        {
            let clusters = this._color,
                color_scheme = this._color_scheme;

            // Clusters array can be null. In this case clustering is done automatically by the 2nd column.
            if (typeof clusters === 'undefined' ||
                clusters === null ||
                clusters === [])
                clusters = this._features[1];

            // Next, if we got a string - consider it as a clustering column.
            if (typeof clusters === 'string')
                // In case we got no scematics - generate a new one.
                if (typeof color_scheme === 'undefined' ||
                    color_scheme === null ||
                    color_scheme === [])
                {
                    this._color = this._values[this._features.findIndex(x => x === clusters)];

                    let clusters_unique = [...new Set(this._color)],
                        colorscale = d3.scale.category20();

                    this._color_scheme = { order: [], min_count: -1, max_count: -1 };

                    clusters_unique.forEach(x => {
                        let count = this._color.map(String).count(x);

                        this._color_scheme[x] = {
                            count: count
                        };

                        if (!this._color_scheme.hasOwnProperty('min_count')) {
                            this._color_scheme.min_count = count;
                            this._color_scheme.max_count = count;
                        }
                        else {
                            this._color_scheme.min_count = Math.min(count, this._color_scheme.min_count);
                            this._color_scheme.max_count = Math.max(count, this._color_scheme.max_count);
                        }
                    });

                    this._color_scheme.order = clusters_unique.sort((a, b) =>
                        this._color_scheme[b].count - this._color_scheme[a].count);

                    clusters_unique.forEach((x, i) =>
                        this._color_scheme[x].color = colorscale(i));

                    console.log('tst', this._color_scheme);

                }
        }

        // Future datatable cells (w/ color if present)
        this._cells = (this.options.draw['mode'] === "cluster") ?
            this._ids.map((x, i) => x.concat([this._color_scheme[this._color[i]].color])):
            this._ids;

        // Options for selectBox
        if (this.options.draw.parts_visible.selector) {
            this._selectBox = $('#s' + this.element_id).select2({
                closeOnSelect: false,
                data: this._features.map((d) => {
                    return {id: d, text: d, selected: this._graph_features.includes(d)};
                }),
                multiple: true,
                width: 'auto'
            })
            // If the list changes - redraw the graph
                .on("change.select2", () => {
                    this._graph_features = $('#s' + this.element_id).val();
                    this._createGraph();
                });

            this._selectBox.data('select2').$container.css("display", "block");
        }

        // Append an SVG to draw lines on
        let container = d3.select("#" + this.element_id)
            .append('div')
				.attr('class', 'pc-container'),
            svg_container = container.append("div")
                .attr('class', 'pc-svg-container');

        this._graph_header = svg_container.append("div");
        this._graph = svg_container.append("svg");

        // Add a tooltip for long names
        this._tooltip = svg_container.append("div")
            .attr('class', 'tooltip')
            .style('opacity', 0);

        // A hint on how to use
        if (this.options.draw.parts_visible.hint)
            svg_container
                .append('p')
                .html('Use the Left Mouse Button to select a curve and the corresponding line in the table <br>' +
                    'Hover over the lines with mouse to see the row in the table');

        // Currently selected line id
        this._selected_line = -1;

        // Add the table below the ParCoords
        if (this.options.draw.parts_visible.table)
            container
                .append("div")
                    .attr({
                        "id": "t" + this.element_id + "_wrapper-outer",
                        'class': 'pc-table-wrapper'
                    });

        // Draw the graph and the table
        this._createGraph();
        if (this.options.draw.parts_visible.table) this._createTable();

        if(this.options.draw['mode'] === 'cluster' &&
            this.options.draw.parts_visible.cluster_table){
                this._ci_div = container.append('div')
                    .attr("class", 'pc-cluster-table-wrapper');
                this._createClusterInfo();
        }

        // trash bin :)
        
        /* $("#" + element_id + ".svg")
                .tooltip({
                track: true
                });*/
        // console.log('ids', _ids);

        //console.log(_PCobject);
        //bold[0][i].attr("display", "block");
        //stroke: #0082C866;

        /*_PCobject._datatable.rows().nodes()
            .to$().removeClass('table-selected-line');*/

        return this;
    }

    // Function to draw the graph
    _createGraph(static_height = null) {
        // A link to this ParCoord object
        var _PCobject = this;

        // Clear the graph div if something is there
        if (this._svg !== undefined) this._svg.remove();

        // Sizes of the graph
        this._margin = { top: 30, right: 10, bottom: 10, left: 45 };
        this._width = (this._graph_features.length > 5 ? 100 * this._graph_features.length : 600) -
            this._margin.left - this._margin.right;
        this._height = 500 - this._margin.top - this._margin.bottom;

        // Arrays for x and y data, and brush dragging
        this._x = d3.scale.ordinal().rangePoints([0, this._width], 1);
        this._y = {};
        this._ranges = {};
        this._dragging = {};

        // Line and axis parameters, arrays with lines (gray and colored)
        this._line = d3.svg.line().interpolate("monotone");
        this._axis = d3.svg.axis().orient("left");

        if (this._graph_popup !== undefined) this._graph_popup.remove();
        this._graph_popup = this._graph_header.append("div")
            .attr('class', 'pc-graph-header')
            .style('display', 'none');

        // Shift the draw space
        this._svg = this._graph.append("g")
            .attr("transform", "translate(" + this._margin.left + "," + this._margin.top + ")");

        // Extract the list of dimensions and create a scale for each
        this._x.domain(this._graph_features);

        // Modify the graph height in case of ordinal values
        this._features_strings_length = [];
        if (typeof static_height === 'boolean') this._static_height = static_height;

        let popup_shown = false;
        this._graph_features.forEach(dim => {
            if (!this._isNumbers(dim)) {
                let count = [...new Set(this._values[this._features.indexOf(dim)])].length;

                this._features_strings_length.push({
                    id: dim,
                    count: count
                });

                if (count * 18 > 500 - this._margin.top - this._margin.bottom){
                    if(!this._static_height) {
                        this._height = Math.max(this._height, count * 18 - this._margin.top - this._margin.bottom);

                        if(!popup_shown){
                            this._graph_popup
                                .style('display', '')
                                .append('p')
                                    .attr('class', 'pc-closebtn')
                                    .on('click', () => {this._graph_popup.style('display', 'none')})
                                    .html('&times;');

                            this._graph_popup
                                .append('span')
                                    .attr('class', 'pc-graph-header-text')
                                    .html('<b>Info.</b> Feature "' + dim + '" has too many unique values, ' +
                                        'the graph height was automatically increased to be human readable. ');
                            this._graph_popup
                                .append('span')
                                    .attr('class', 'pc-graph-header-text')
                                    .on('click', () => this._createGraph(true))
                                    .html(' <u><i>Click here to return to the default height.</i></u>');
                        }
                        else
                            this._graph_popup.select('span')
                                .html('<b>Info.</b> Multiple features have too many unique ' +
                                    'values, the graph height was automatically increased to be human readable. ');

                        popup_shown = true;
                    }
                    else
                        if(!popup_shown){
                            this._graph_popup
                                .style('display', '')
                                .append('p')
                                    .attr('class', 'pc-closebtn')
                                    .on('click', () => {this._graph_popup.style('display', 'none')})
                                    .html('&times;');

                            this._graph_popup
                                .append('span')
                                    .attr('class', 'pc-graph-header-text')
                                    .html('<b>Info.</b> One of features has too many unique' +
                                        ' values, the graph height can increased to be human readable. ');

                            this._graph_popup
                                .append('span')
                                    .attr('class', 'pc-graph-header-text')
                                    .on('click', () => this._createGraph(false))
                                    .html(' <u><i>Click here to increase the height.</i></u>');

                            popup_shown = true;
                        }
                        else this._graph_popup.select('span')
                            .html('<b>Info.</b> Multiple features have too many unique ' +
                                'values, the graph height can increased to be human readable. ');
                }
            }
        });

        // Make scales for each feature
        this._graph_features.forEach(dim => {
            if (this._isNumbers(dim))
                this._y[dim] = d3.scale.linear()
                    .domain([Math.min(...this._values[this._features.indexOf(dim)]),
                        Math.max(...this._values[this._features.indexOf(dim)])])
                    .range([this._height, 0]);
            else {
                this._y[dim] = d3.scale.ordinal()
                    .domain(this._values[this._features.indexOf(dim)])
                    .rangePoints([this._height, 0]);
                this._ranges[dim] = this._y[dim].domain().map(this._y[dim]);
            }
        });

        // Change the SVG size to draw lines on
        this._graph
            .attr({"width": this._width + this._margin.left + this._margin.right,
                "height": this._height + this._margin.top + this._margin.bottom });

        // Array to make brushes
        this._line_data = this._data.map(x =>
            Object.fromEntries(this._graph_features.map(f => ([f, x[this._features.indexOf(f)]]))));

        // Grey background lines for context
        this._background = this._svg.append("g")
            .attr("class", "background")
            .selectAll("path")
            .data(this._line_data)
            .enter().append("path")
            .attr("d", this._path.bind(this));

        // Foreground lines
        this._foreground = this._svg.append("g")
            .attr("class", "foreground")
            .selectAll("path")
            .data(this._line_data)
            .enter().append("path")
            .attr("d", this._path.bind(this))

            // Cluster color scheme is applied to the stroke color 
            .attr("stroke", (d, i) => (
                (this.options.draw['mode'] === "cluster")?
                    this._color_scheme[this._color[i]].color:
                    "#0082C866")
                )
            .attr("stroke-opacity", "0.4")

            // When mouse is over the line, make it bold and colorful, move to the front
            // and select a correspoding line in the table below
            .on("mouseover", function (d, i) {
                if (_PCobject._selected_line !== -1) return;

                let time = Date.now();

                $(this).addClass("bold");
                d3.select(this).moveToFront();

                if (_PCobject.options.draw.parts_visible.table) {
                    let row = _PCobject._datatable.row((idx, data) => data === _PCobject._parcoordsToTable(i));

                    row.show().draw(false);
                    _PCobject._datatable.rows(row).nodes().to$().addClass('table-selected-line');
                }
                // In case of debug enabled
                // Write time to complete the search, average time, minimum and maximum
                if (_PCobject._debug)
                {
                    time = Date.now() - time;
                    _PCobject._search_time += time;
                    _PCobject._search_quantity += 1;

                    if (_PCobject._search_time_min === -1)
                    {
                        _PCobject._search_time_min = time;
                        _PCobject._search_time_max = time;
                    }

                    if (_PCobject._search_time_min > time) _PCobject._search_time_min = time;
                        else if (_PCobject._search_time_max < time) _PCobject._search_time_max = time;

                    console.log("Search completed for %ims, average: %sms [%i; %i].",
                        time, (_PCobject._search_time/_PCobject._search_quantity).toFixed(2),
                        _PCobject._search_time_min, _PCobject._search_time_max);
                }
            })

            // When mouse is away, clear the effect
            .on("mouseout", function (d, i) {
                if (_PCobject._selected_line !== -1) return;

                $(this).removeClass("bold");

                if (_PCobject.options.draw.parts_visible.table) {
                    let row = _PCobject._datatable.row((idx, data) => data === _PCobject._parcoordsToTable(i));
                    _PCobject._datatable.rows(row).nodes().to$().removeClass('table-selected-line');
                }
            })

            // Mouse click selects and deselects the line
            .on("click", function (d, i) {
                if (_PCobject._selected_line === -1) {
                    _PCobject._selected_line = i;

                    $(this).addClass("bold");
                    d3.select(this).moveToFront();

                    if (_PCobject.options.draw.parts_visible.table) {
                        let row = _PCobject._datatable.row((idx, data) => data === _PCobject._parcoordsToTable(i));

                        row.show().draw(false);
                        _PCobject._datatable.rows(row).nodes().to$().addClass('table-selected-line');
                    }
                }
                else if (_PCobject._selected_line === i) _PCobject._selected_line = -1;
            });

        // Add a group element for each dimension
        this._g = this._svg.selectAll(".dimension")
            .data(this._graph_features)
            .enter().append("g")
            .attr("class", "dimension")
            .attr("transform", function (d) { return "translate(" + _PCobject._x(d) + ")"; })
            .call(d3.behavior.drag()
                .origin(function (d) { return { x: this._x(d) }; }.bind(this))
                .on("dragstart", function (d) {
                    this._dragging[d] = this._x(d);
                    this._background.attr("visibility", "hidden");
                }.bind(this))
                .on("drag", function (d) {
                    this._dragging[d] = Math.min(this._width, Math.max(0, d3.event.x));
                    this._foreground.attr("d", this._path.bind(this));
                    this._graph_features.sort(function (a, b) { return this._position(a) - this._position(b); }.bind(this));
                    this._x.domain(this._graph_features);
                    this._g.attr("transform", function (d) { return "translate(" + this._position(d) + ")"; }.bind(this));
                }.bind(this))
                .on("dragend", function (d, i) {
                    delete _PCobject._dragging[d];
                    _PCobject._transition(d3.select(this)).attr("transform", "translate(" + _PCobject._x(d) + ")");
                    _PCobject._transition(_PCobject._foreground).attr("d", _PCobject._path.bind(_PCobject));
                    _PCobject._background
                        .attr("d", _PCobject._path.bind(_PCobject))
                        .transition()
                        .delay(500)
                        .duration(0)
                        .attr("visibility", null);
                }));

        // Function to limit the length of the strings
        let limit = ((x, width, font) => {
            let sliced = false;
            while (getTextWidth(x, font) > width) {
                x = x.slice(0, -1);
                sliced = true;
            }
            return x + ((sliced) ? '...' : '');
        });
        var show_tooltip = (d, width) => {
            if(!limit(d, width, '\'Oswald script=all rev=1\' 10px sans-serif').endsWith('...')) return;

            //on mouse hover show the tooltip
            _PCobject._tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            _PCobject._tooltip.html(d)
                .style("left", (d3.event.pageX) + "px")
                .style("top", (d3.event.pageY) + "px");
        };

        // Add an axis and titles
        this._g.append("g")
            .attr("class", "axis")
            .each(function (d) {d3.select(this).call(_PCobject._axis.scale(_PCobject._y[d]))})
            .append("text")
                .attr({
                    "y": -9,
                    "class": "pc-titles-text"
                })
                .text((x) => limit(x, 85, '\'Oswald script=all rev=1\' 10px sans-serif'))
                .on("mouseover", (d) => show_tooltip(d, 85))
                .on("mouseout", () => _PCobject._tooltip.transition().duration(500).style("opacity", 0));

        // Limit the tick length and show a tooltip on mouse hover
        d3.selectAll('.tick')
            .on("mouseover", (e) => show_tooltip(isNaN(e) ? e : numberWithSpaces(e), 70))
            .on("mouseout", () => _PCobject._tooltip.transition().duration(500).style("opacity", 0))
            .select('text')
                .text((a) => limit(isNaN(a) ? a : numberWithSpaces(a), 70,
                    '\'Oswald script=all rev=1\' 10px sans-serif'));

        // Add and store a brush for each axis
        this._g.append("g")
            .attr("class", "brush")
            .each(function (d) {
                d3.select(this).call(
                    _PCobject._y[d].brush = d3.svg.brush()
                        .y(_PCobject._y[d])
                        .on("brushstart", _PCobject._brushstart)
                        .on("brush", _PCobject._brush.bind(this, _PCobject)));
            })
            .selectAll("rect")
            .attr("x", -8)
            .attr("width", 16);
    }

    // Creates a table below the ParallelCoordinates graph
    _createTable() {
        // A link to this ParCoord object
        var _PCobject = this;
        
        // Clear the table div if something is there
        $('#t' + this.element_id + "_wrapper-outer").empty();

        // Add table to wrapper
        d3.select("#t" + this.element_id + "_wrapper-outer")
            .append("table")
                .attr({"id": "t" + this.element_id,
                        "class": "table hover"});

        // Initialize a search result with all objects visible and
        // 'visible' data array with lines on foreground (not filtered by a brush)
        this._search_results = this._ids;
        this._visible = this._ids;

        // Map headers for the tables
        this._theader = this._features.map(row => {
            return {
                title: row,

                // Add spaces and remove too much numbers after the comma
                "render": function (data, type, full) {
                    if (type === 'display' && !isNaN(data))
                        return numberWithSpaces(parseFloat(Number(data).toFixed(2)));

                    return data;
                }
            };
        });

        // Vars for table and its datatable
        this._table = $('#t' + this.element_id);
        this._datatable = this._table.DataTable({
            data: this._cells,
            columns: this._theader,

            mark: true,
            dom: 'Blfrtip',
            colReorder: true,
			stateSave: true,
            buttons: (this.options.draw.parts_visible.table_colvis)?['colvis']:[],
            "search": {"regex": true},

            // Make colors lighter for readability
            "rowCallback": (row, data) => {
                if (this.options.draw['mode'] === "cluster")
                    $(row).children().css('background', data[data.length - 1] + "33");

                $(row).children().css('white-space', 'nowrap');
            },

            // Redraw lines on ParCoords when table is ready
            "fnDrawCallback": () => {
                _PCobject._on_table_ready(_PCobject);
            }
        });

        this._fix_css_in_table('t' + this.element_id);

        // Add bold effect to lines when a line is hovered over in the table
        $(this._datatable.table().body())
            .on("mouseover", 'tr', function (d, i) {
                if (_PCobject._selected_line !== -1) return;

                let line = _PCobject._foreground[0][_PCobject._tableToParcoords(
                    _PCobject._datatable.row(this).data())];
                $(line).addClass("bold");
                d3.select(line).moveToFront();

                $(_PCobject._datatable.rows().nodes()).removeClass('table-selected-line');
                $(_PCobject._datatable.row(this).nodes()).addClass('table-selected-line');
            })
            .on("mouseout", 'tr', function (d) {
                if (_PCobject._selected_line !== -1) return;

                $(_PCobject._datatable.rows().nodes()).removeClass('table-selected-line');

                $(_PCobject._foreground[0][
                    _PCobject._tableToParcoords(_PCobject._datatable.row(this).data())
                ]).removeClass("bold");
            })

            // If the line is clicked, make it 'selected'. Remove this status on one more click.
            .on("click", 'tr', function (d, i) {
                if (_PCobject._selected_line === -1) {
                    _PCobject._selected_line = _PCobject._tableToParcoords(_PCobject._datatable.row(this).data());

                    let line = _PCobject._foreground[0][_PCobject._selected_line];
                    $(line).addClass("bold");
                    d3.select(line).moveToFront();

                    _PCobject._datatable.rows(this).nodes().to$().addClass('table-selected-line');
                }
                else if (_PCobject._selected_line === _PCobject._tableToParcoords(
                    _PCobject._datatable.row(this).data())) {
                        let line = _PCobject._foreground[0][_PCobject._selected_line];
                        $(line).removeClass("bold");

                        _PCobject._selected_line = -1;
                        _PCobject._datatable.rows(this).nodes().to$().removeClass('table-selected-line');
                    }
            });

        // Add footer elements
        this._table.append(
            $('<tfoot/>').append($('#t' + this.element_id + ' thead tr').clone())
        );

        // Add inputs to those elements
        $('#t' + this.element_id + ' tfoot th').each(function (i, x) {
            $(this).html('<input type="text" placeholder="Search" id="t' +
                _PCobject.element_id + 'Input' + i + '"/>');
        });

        // Apply the search
        this._datatable.columns().every(function (i, x) {
            $('#t' + _PCobject.element_id + 'Input' + i).on('keyup change', function () {
                _PCobject._datatable
                    .columns(i)
                    .search(this.value, true)
                    .draw();
            });
        });

        // Callback for _search_results filling
        $.fn.dataTable.ext.search.push(
            function (settings, data, dataIndex, rowData, counter) {
                if (settings.sTableId !== "t" + _PCobject.element_id) return true;

                if (counter === 0) _PCobject._search_results = [];

                if (_PCobject._visible
                        .some(x => x
                            .every((y, i) =>
                                y === data[i]))) {
                    _PCobject._search_results.push(data);

                    return true;
                }
                return false;
            }
        );
    }

    // Create cluster info buttons (which call the table creation)
    _createClusterInfo() {
        // Add a div to hold a label and buttons
        this._ci_buttons_div = this._ci_div.append('div');

        // Add 'Choose Cluster' text to it
        this._ci_buttons_div
            .append('label')
                .text("Choose Cluster");

        // Add a div for the table
        this._ci_table_div = this._ci_div.append('div');

        //Add a div to hold the buttons after the label
        this._ci_buttons = this._ci_buttons_div
            .append('div')
                .attr({'class': 'ci-button-group',
                        'id': 'ci_buttons_' + this.element_id});

        let scheme = this._color_scheme,
            scale = d3.scale.sqrt()
                .domain([scheme.min_count, scheme.max_count])
                .range([100, 0]);

        // Add corresponding buttons to every color
        this._ci_buttons
            .selectAll("a")
                .data(scheme.order)
                .enter().append('a')
                    .attr({'class': 'ci-button',
                            'title': id => "Cluster " + id + ".\nElement count: " + scheme[id].count + "."})
                    .style('background', id => 'linear-gradient(90deg, ' + scheme[id].color +
                        ' ' + (99 - scale(scheme[id].count)) + '%, white ' + (101 - scale(scheme[id].count)) + '%')
                    .text(id => id)
                    .on("click", id => {
                        d3.event.preventDefault();

                        // Apply the activated class
                        this._ci_buttons_div.attr('class', 'ci-buttons-active');

                        // Clean all children
                        this._ci_table_div
                            .style('border', "5px dashed " + this._color_scheme[id].color + "33")
                            .attr('class', 'ci-table pc-table-wrapper')
                            .html('');

                        // Add the 'selected' decoration
                        this._ci_buttons_div.selectAll('*').classed('ci-selected', false);
                        d3.select(d3.event.target).classed('ci-selected', true);

                        // Add 'Cluster # statistics' text
                        this._ci_table_div
                            .append('h3')
                                .text("Cluster " + d3.event.target.innerText + " statistics");

                        // Print the stats
                        this._createClusterStatsTable();
                    });
    }

    // Creates a table with cluster info
    // The function must be called from onClick, as it uses the d3.event.target
    _createClusterStatsTable() {
        // A link to this ParCoord object
        var _PCobject = this;

        // Make the header array
        this._ci_header = ['', "Min", "Mean", "Max", "Median", "Deviation"].map((x, i) => { return {
            title : x,
            className: (i === 0)? 'firstCol':'',

            // Add spaces and remove too much numbers after the comma
            "render": function (data, type, full) {
                if (type === 'display' && !isNaN(data))
                    return numberWithSpaces(parseFloat(Number(data).toFixed(2)));

                return data;
            }
        }});

        // Prepare data and values arrays for calculations
        this._ci_cluster_data = this._data.filter((x, i) => String(this._color[i]) === d3.event.target.innerText);
        this._ci_cluster_values = this._ci_cluster_data[0].map((col, i) => this._ci_cluster_data.map(row => row[i]));

        // Prepare table cells
        this._ci_cells = this._features.map((x, i) =>
            (this._isNumbers(x)) ?
            [
                x,
                d3.min(this._ci_cluster_data, row => (row[i] === null) ? 0 : row[i]),
                d3.mean(this._ci_cluster_data, row => (row[i] === null) ? 0 : row[i]),
                d3.max(this._ci_cluster_data, row => (row[i] === null) ? 0 : row[i]),
                d3.median(this._ci_cluster_data, row => (row[i] === null) ? 0 : row[i]),
                (this._ci_cluster_data.length > 1) ? d3.deviation(this._ci_cluster_data, row =>
                    (row[i] === null) ? 0 : row[i]) : '-'
            ] : [x + ' <i>(click to expand)</i>', '-','-','-','-','-']);

        // Calculate stats for string values
        this._ci_string_stats = this._features_strings.map((name) => [name,
            [...new Set(
                this._ci_cluster_values[
                    this._features.findIndex((x) => x === name)
                ])
            ].map(x => [x,
                this._ci_cluster_values[this._features.findIndex((x) => x === name)].count(x)])]);

        // Add 'Number of elements: N' text
        this._ci_table_div
            .append('h5')
            .text('Number of elements: ' + this._ci_cluster_data.length);

        // Create the table
        this._ci_table_div
            .append('table')
            .attr('id', 'ci_table_' + this.element_id);

        // Add the data to the table
        let table = $('#ci_table_' + this.element_id).DataTable({
            data: this._ci_cells,
            columns: this._ci_header,
            mark: true,
            dom: 'Alfrtip',
            colReorder: true,
            buttons: (this.options.draw.parts_visible.table)?['colvis']:[],
            "search": {"regex": true}
        });

        // Add line getting darker on mouse hover
        $(table.table().body())
            .on("mouseover", 'tr', function (d, i) {
                $(table.rows().nodes()).removeClass('table-selected-line');
                $(table.row(this).nodes()).addClass('table-selected-line');
            })
            .on("mouseout", 'tr', function (d) {
                $(table.rows().nodes()).removeClass('table-selected-line');
            })
            // Add event listener for opening and closing details
            .on('click', 'td.firstCol', function(){
                if (!this.innerText.endsWith(' (click to expand)') || _PCobject._ci_string_stats === [] ) return;

                let feature = this.innerText.replace(' (click to expand)', ''),
                    id = _PCobject._features_strings.indexOf(feature),
                    table_id = 'ci-' + _PCobject.element_id + '-' + id,
                    tr = $(this).closest('tr'),
                    row = table.row( tr ),
                    text = '<table id="' + table_id + '" class="ci_aux_table" style="width:min-content">';

                _PCobject._ci_string_stats[id][1].forEach(x => {
                    text += '<tr><td>' + x[0] + '</td><td> ' + x[1] + '</td></tr>'
                });

                text+='</table>';

                if(row.child.isShown()){
                    // This row is already open - close it
                    row.child.hide();
                    tr.removeClass('shown');
                } else {
                    // Open this row
                    row.child(text).show();
                    tr.addClass('shown');

                    let table = $('#' + table_id).DataTable({
                        columns:[
                            {title: feature},
                            {title: "Count"}
                            ],
                        dom: 't',
                        order: [[1, "desc"]]
                    });

                    $(table.table().body())
                        .on("mouseover", 'tr', function () {
                            $(table.rows().nodes()).removeClass('table-selected-line');
                            $(table.row(this).nodes()).addClass('table-selected-line');
                        })
                        .on("mouseout", 'tr', function () {
                            $(table.rows().nodes()).removeClass('table-selected-line');
                        });
                }
            });

        // Fix the css
        this._fix_css_in_table('ci_table_' + this.element_id);
    }

    // Functions to perform id transformation
    _tableToParcoords(object) { return this._cells.findIndex(x => object.every((y, i) => y === x[i])); }
    _parcoordsToTable(index) { return this._cells[index]; }

    _isNumbers(featureName) { return this._features_numbers.includes(featureName); }

    // Callback to change the lines visibility after 'draw()' completed
    _on_table_ready(object) {
        object._foreground.style("display", function (d, j) {
            return object._search_results
                    .some(x => x
                        .every((y, i) =>
                            y === object._ids[j][i]))
                ? null : "none";
        });
    }

    // Bug fixes related to css
    _fix_css_in_table(id){
        d3.select('#' + id + '_wrapper')
            .insert("div", ".dataTables_filter + *")
            .attr('class', 'pc-table-contents')
            .node()
                .appendChild(document.getElementById(id));
    }

    // Functions for lines and brushes
    _position(d) {
        let v = this._dragging[d];
        return v == null ? this._x(d) : v;
    }

    _transition(g) {
        return g.transition().duration(500);
    }

    _brushstart() {
        d3.event.sourceEvent.stopPropagation();
    }

    // Returns the path for a given data point
    _path(d) {
        return this._line(
            this._graph_features.map(
                function (p) { return [this._position(p), this._y[p](d[p])]; },
                this
            )
        );
    }

    // Handles a brush event, toggling the display of foreground lines
    _brush(object) {
        let actives = object._graph_features.filter(function (p) { return !object._y[p].brush.empty(); }),
            extents = actives.map(function (p) { return object._y[p].brush.extent(); }),
            visible = [];

        if (actives.length === 0) visible = object._ids;
        else object._foreground.each(function (d, j) {
            let isVisible = actives.every(function (p, i) {
                let value = null;

                if (!object._isNumbers(p))
                    value = object._ranges[p][object._y[p].domain().findIndex(x => x === d[p])];
                else value = d[p];

                return extents[i][0] <= value && value <= extents[i][1];
            });
            
            if (isVisible) visible.push(object._ids[j]);
        });

        object._visible = visible;
        object._datatable.draw();
    }
}