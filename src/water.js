
function Wheel(App) {
    this.App = App;

    // Parameters
    this.width = 300;
    this.height = this.width;
    this.radius = this.width / 2;
    this.padding = 5;
    this.duration = 1000;

    // Classes
    this.x = d3.scale.linear()
        .range([0, 2 * Math.PI])
    this.y = d3.scale.pow()
        .exponent(1.3)
        .domain([0, 1])
        .range([0, this.radius]);
    this.arc = undefined;

    // Visual Elements
    this.svg_g = undefined;
    this.wedges = undefined;
    this.labels = undefined;

    // Data Elements
    this.nodes = undefined;
    this.root = undefined;
}
Wheel.prototype = {
    build: function() {
        var div = d3.select("#wheel-container");

        this.svg_g = div.append("svg")
            .attr("width", this.width + this.padding * 2)
            .attr("height", this.height + this.padding * 2)
            .append("g")
            .attr("transform", "translate(" + [this.radius + this.padding, this.radius + this.padding] + ")");

        this.arc = d3.svg.arc()
            .startAngle( d => Math.max(0, Math.min(2 * Math.PI, this.x(d.x0))))
            .endAngle(   d => Math.max(0, Math.min(2 * Math.PI, this.x(d.x1))))
            .innerRadius(d => Math.max(0, d.y0 ? this.y(d.y0) : d.y0))
            .outerRadius(d => Math.max(0, this.y(d.y1)));

        this.populate();
    },
    populate: function () {
        this.nodes = this.App.nodes_arr;
        this.root = this.nodes[0];

        // Add paths
        this.wedges = this.svg_g.selectAll("path").data(this.nodes);

        this.wedges.enter().append("path")
            .attr("id", (d, i) => "path-" + i)
            .attr("d", this.arc)
            .attr("fill-rule", "evenodd")
            .attr('class', d => 'wheel-wedge')
            .style("fill", d => d.color)
            .on("mouseover", this.App.fillColor.bind(this.App, 'Focus'))
            .on("mouseout", this.App.fillColor.bind(this.App, 'Wheel-Subtree'))
            .on("click", this.click.bind(this));

        // Add text
        this.labels = this.svg_g.selectAll("text").data(this.nodes);

        // TODO: disable cursor & events (follow through)
        var textEnter = this.labels.enter().append("text")
            .attr("class", function (node) {
                if(this.App.LABEL_COLOR == 'brightness')
                    return brightness(d3.rgb(node.color)) < 125 ? 'wheel-label wheel-label-bright' : 'wheel-label';
                return 'wheel-label';
            }.bind(this))
            .attr("text-anchor", node => this.x(node.xm) > Math.PI ? "end" : "start")
            .attr("transform", function (d) {
                var multiline = (d.name || "").split("-").length > 1;
                var angle = this.x(d.xm) * 180 / Math.PI - 90;
                var rotate = angle + (multiline ? -.5 : 0);
                return "rotate(" + rotate + ")translate(" + (this.y(d.y0) + this.padding) + ")rotate(" + (angle > 90 ? -180 : 0) + ")";
            }.bind(this))
            .on("mouseover", this.App.fillColor.bind(this.App, 'Lineage'))
            .on("mouseout", this.App.fillColor.bind(this.App, 'Wheel-Subtree'))
            .on("click", this.click.bind(this))
        textEnter.append("tspan")
            .attr('class', d => d.word2 ? 'wheel-label-word1' : null)
            .attr("x", 0)
            .html(d => d.depth ? d.word1  : "");
        textEnter.append("tspan")
            .attr('class', 'wheel-label-word2')
            .attr("x", 0)
            .text(d => d.depth ? d.word2 || "" : "");
    },
    click: function(basis) {
        var oldroot = this.root;
        this.root = basis;
        var isDescendent = this.App.ancestryComparison('Subtree');

        this.wedges.transition('click')
            .duration(this.duration)
            .attrTween("d", this.arcTween(basis));

        // Somewhat of a hack as we rely on arcTween updating the scales.
        this.labels //.style("visibility", node => isDescendent(node, oldroot) ? null : "hidden")
            .transition('click')
            .duration(this.duration)
            .style("opacity", node => isDescendent(node, basis) ? 1 : 0)
            .attrTween("text-anchor", node => () => this.x(node.xm) > Math.PI ? "end" : "start")
            .attrTween("transform", function (node) {
                return function () {
                    var angle = this.x(node.xm) * 180 / Math.PI - 90;
                    var rotate = angle + (node.word2 ? -0.5 : 0);
                    return "rotate(" + rotate + ")translate(" + (this.y(node.y0) + this.padding) + ")rotate(" + (angle > 90 ? -180 : 0) + ")";
                }.bind(this);
            }.bind(this))
            .each("end", function(node) { // Toggle off invisible text so clicks don't overlap
                d3.select(this).style("visibility", isDescendent(node, basis) ? null : "hidden");
            });

        this.App.fillColor.apply(this.App, ['Wheel-Subtree', basis]);
    },
    arcTween: function(node) {
        var y_max = maxY(node);
        var xd = d3.interpolate(this.x.domain(), [node.x0, node.x1]);
        var yd = d3.interpolate(this.y.domain(), [node.y0, y_max]);
        var yr = d3.interpolate(this.y.range(), [node.y0 ? 20 : 0, this.radius]);
        return function (node) {
            return function (t) {
                this.x.domain(xd(t));
                this.y.domain(yd(t)).range(yr(t));
                return this.arc(node);
            }.bind(this);
        }.bind(this);
    },
};


function InteractiveMap() {
    // Options
    this.COLOR_SCHEME = 'hue-parents'; // hash, hue[-children], hue-lab, hue-parents
    this.LABEL_COLOR = 'brightness'; // brightness, flat
    this.COLOR_CHANGE_DURATION = 250; // ms

    // Classes
    this.tooltip = new Tooltip();
    this.wheel = undefined;

    // Data
    this.hierarchy = undefined;
    this.nodes_root = undefined;
    this.nodes_arr = undefined;
    this.cur_parent = "";

    // Map
    this.map = undefined;
    this.geo_zones = undefined;
}

InteractiveMap.prototype = {
    init: function() {
        this.tooltip.init();
        this.wheel = new Wheel(this);

        // Load Data
        d3.xml("data/water-geo.svg", this.loadVectorGraphImage.bind(this));
        d3.json("data/water-hierarchy.json", this.loadHierarchyJson.bind(this));
    },
    loadVectorGraphImage: function(xml) {
        // Add map directly from SVG
        document.getElementById('map-container').appendChild(xml.documentElement);
        this.map = d3.select('#map-container svg');
        this.geo_zones = this.map.selectAll('.zone');

        this.initializeRegions();
    },
    loadHierarchyJson: function(json) {
        this.hierarchy = json;
        this.buildRegionTree();

        this.initializeRegions();
    },
    initializeRegions: function() {
        if(!this.map || !this.nodes_arr) return;

        // Set geo region classes
        this.nodes_arr.forEach(function(node) {
            this.map.selectAll("." + node.name + ".zone").each(function() {
                d3.select(this)
                    .data([node])
                    .attr("title", node.name)
                    .attr("class", node.name + " zone " + node.ancestors.join(" "));
            });
        }, this);

        this.setRegionInteraction();

        this.wheel.build();
    },
    buildRegionTree: function() {
        var tree = {
            name: 'Water',
            ancestors: [],
            children: treeArray(this.hierarchy, ['Water'])
        };
        this.nodes_root = d3.hierarchy(tree)
            .sum(node => node.children.length ? 0 : 5.8 - node.depth); // Controls the width
        this.nodes_arr = d3.partition()(this.nodes_root).descendants();

        // Add a few variables that will help further functions
        this.nodes_arr.forEach(function(node) {
            node.name = node.data.name;
            node.ancestors = node.data.ancestors;
            delete node.data;

            node.word1 = node.name.split("-")[0];
            node.word2 = node.name.split("-")[1];
            node.xm = (node.x0 + node.x1) / 2;
        }, this);

        this.colorNodes();
    },
    colorNodes: function() {
        // Color leaf or parent nodes
        var leaves = this.nodes_arr.filter(node => node.children == undefined);
        leaves.sort((a, b) => a.x0 - b.x0);
        var parents = this.nodes_arr.filter(node => node.children != undefined);
        parents.sort((a, b) => (a.x1 + a.x0) - (b.x1 + b.x0) || a.x0 - b.x0);

        if(this.COLOR_SCHEME == 'hue' || this.COLOR_SCHEME == 'hue-children') {
            leaves.forEach(function(node, i) {
                node.color = d3.hsl(i * 360 / leaves.length, // Hue
                                    i * 3.14 % 0.7 + 0.3,  // Saturation
                                    i * 3.14 % 0.35 / 2 + 0.4); // Lightness

                // correct for darkness
                node.color = d3.lab(node.color);
                node.color.l = node.color.l * 0.8 + 20;
            });
        } else if(this.COLOR_SCHEME == 'hue-lab') {
            leaves.forEach(function(node, i) {
                var e = i / leaves.length;
                var light_diff = Math.cos(e * 60 * Math.PI) * 15;
                var sat_diff = 1; //(Math.cos(e * 60 * Math.PI) + 1) / 2 * 0.5 + 0.5;
                node.color = d3.lab(light_diff + 70, // Lightness
                                    sat_diff * (Math.abs(e - 0.5) * 400 - 100),  // Red/Cyan
                                    sat_diff * (Math.abs(Math.abs(e - 0.25) - 0.5) * 400 - 100)); // Yellow/Blue
            });
        } else if (this.COLOR_SCHEME == 'hue-parents') {
            parents.forEach(function(node, i) {
                // Assign color based on hue
                node.color = d3.hsl(i * 360 / parents.length, 0.5, 0.5);
                node.color = d3.lab(node.color);
                node.color.l = node.color.l * 0.8 + 20;

                // Assign children's colors
                node.children.forEach(function(child, j) {
                    if(child.children == undefined) {
                        child.color = d3.lab(node.color); // clone
                        child.color.l += (j % 2 - 0.5) * 20;
                    }
                });
            });
        } else { // Hash, not perfect
            leaves.forEach(function(node, i) {
                node.color = str2rgb(node.data.name || "");

                // correct for darkness
                node.color = d3.lab(node.color);
                node.color.l = node.color.l * 0.5 + 50;
            });
        }

        // Color remaining nodes
        this.nodes_arr.forEach(function(node) {
            node.color = this.regionColor(node); 
        })
    },
    regionColor: function(node) {
        if (node.name == "Uninhabited")
            return "#fff";
        if (node.name == "Ocean")
            return "#8080FF";

        if(['hue', 'hue-children', 'hue-lab'].includes(this.COLOR_SCHEME)) {
            if (node.children) {
                var colors = node.children.map(node => d3.lab(this.regionColor.apply(this, [node])));
                return d3.lab(d3.mean(colors, color => color.l) * 1.1,
                    d3.mean(colors, color => color.a),
                    d3.mean(colors, color => color.b));
            }
        } else if(['hue-parents'].includes(this.COLOR_SCHEME)) {
            if(!node.children) { // is leaf, needs a color

            }
        } else {
            return str2rgb(node.name || "");
        }
        return node.color || "#fff";
    },
    setRegionInteraction: function() {
        this.geo_zones
            .style("fill", node => node.color)
            .style("stroke", "5")
            .on('mouseover', function (node) {
                this.tooltip.setData({
                        Watershed: node.name,
                        Familes: node.ancestors
                    });
                this.tooltip.on();

                this.fillColor('Focus', node);
            }.bind(this))
            .on("mousemove", d => this.tooltip.move(d3.event.x, d3.event.y))
            .on('mouseout', function (node) {
                this.tooltip.off();

                this.fillColor('Wheel-Subtree', node);
            }.bind(this))
            .style({'stroke-width': '0.25'})
            .selectAll("path")
                .style({'stroke-width': '0.25'});
    },
    ancestryComparison: function(type) {
        // a = node, b = basis
        if(type == 'Node') {
            return (a, b) => a.name == b.name;
        } else if(type == 'Ancestors') {
            return (a, b) => a.name == b.name || b.ancestors.includes(a.name);
        } else if(type == 'Lineage') {
            return (a, b) => a.name == b.name || b.ancestors.includes(a.name) || a.ancestors.includes(b.name);
        } else if(type == 'Subtree') {
            return (a, b) => a.name == b.name || a.ancestors.includes(b.name);
        } else if(type == 'Wheel-Subtree') {
            var cmp = this.ancestryComparison('Subtree');
            return (a, b) => cmp(a, this.wheel.root);
        } else {
            return (a, b) => true;
        }
    },
    fillColor: function(type, basis) {
        var wheel_cmp, geo_cmp;
        if(type == 'Focus') {
            wheel_cmp = (a, b) => a.name == b.name // Self
                    || b.ancestors.includes(a.name) // Ancestor
                    || a.ancestors.includes(b.name); // Descendent
            geo_cmp = (a, b) => a.name == b.name // Self
                    || a.ancestors.includes(b.name); // Descendent
        } else { // Visible on Wheel / Selected Family
            wheel_cmp = (a, b) => a.name == this.wheel.root.name // Self
                    || a.ancestors.includes(this.wheel.root.name); // Descendent
            geo_cmp = (a, b) => a.name == this.wheel.root.name // Self
                    || a.ancestors.includes(this.wheel.root.name); // Descendent
        }
        
        // TODO fix stale colors, cancel in-progress transitions
        this.wheel.wedges.transition('color')
            .duration(this.COLOR_CHANGE_DURATION)
            .style('stroke-opacity', node => wheel_cmp(node, basis) ? 0.5 : 0.1)
            .style('fill-opacity', node => wheel_cmp(node, basis) ? 1.0 : 0.1);
            // .style('fill',         node => isDescendent(node, basis) ? basis.color : node.color);
        this.geo_zones.transition('color')
            .duration(this.COLOR_CHANGE_DURATION)
            .style('stroke-opacity', node => geo_cmp(node, basis) ? 0.5 : 0.1)
            .style('fill-opacity', node => geo_cmp(node, basis) ? 1.0 : 0.1);
            // .style('fill',         node => isDescendent(node, basis) ? basis.color : node.color);
    },
};

function initialize() {
    // Load Interactive Map App
    App = new InteractiveMap();
    App.init();
}
window.onload = initialize;


































