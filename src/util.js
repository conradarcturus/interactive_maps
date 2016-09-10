/**
 * A collection of helpful code written by A. Conrad Nied for other projects
 */

function Tooltip() {
    this.div = {};
    this.info = {};
}
Tooltip.prototype = {
    init: function() {
        this.div = d3.select('body')
            .append('div')
            .attr('class', 'tooltip');
    },
    setData: function(new_data) {
        if(JSON.stringify(this.data) != JSON.stringify(new_data)) {
            // Clear & set new parameters
            this.data = new_data;
            this.div.selectAll('*').remove();

            // Create table
            var rows = this.div.append('table')
                .selectAll('tr')
                .data(Object.keys(new_data))
                .enter()
                .append('tr');

            rows.append('th')
                .html(d => d + ":");

            rows.append('td')
                .html(function(d) { 
                    if(Array.isArray(new_data[d]))
                        return new_data[d].join(', ');
                    return new_data[d];
                });
        }
    },
    on: function() {
        this.div
            .transition(200)
            .style('opacity', 1);
    },
    move: function(x, y) {
        var height = parseInt(this.div.style('height'));
        var pageHeight = document.documentElement.clientHeight;
        if(y + height > pageHeight) {
            y += pageHeight - (y + height)
        }
        
        this.div
            .style({
                left: x + 20 + "px",
                top: y + "px"
            });
    },
    off: function() {
        this.div
            .transition(200)
            .style('opacity', 0);
    },
    attach: function(id, data_transform) {
        d3.selectAll(id)
            .on('mouseover', function(d) {
                this.setData(data_transform(d))
                this.on();
            }.bind(this))
            .on('mousemove', function(d) {
                this.move(d3.event.x, d3.event.y);
            }.bind(this))
            .on('mouseout', function(d) {
                this.off();
            }.bind(this));
    }
};


function str2rgb(s) {
    if (s == "") {
        return "rgb(255,255,255)";
    }
    hash = hashCode(s);
    r = (hash & 0xFF0000) >> 16;
    g = (hash & 0x00FF00) >> 8;
    b = hash & 0x0000FF;
    return "rgb(" + r + ", " + g + ", " + b + ")";
}
function hashCode(s) {
    return s.split("").reduce(function (a, b) {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a
    }, 0);
}


// http://www.w3.org/WAI/ER/WD-AERT/#color-contrast
function brightness(rgb) {
    return rgb.r * .299 + rgb.g * .587 + rgb.b * .114;
}


// Wheel assisting functions
function treeArray(subtree, ancestors) {
    return Object.keys(subtree).map(function(name) {
        return {
            name: name,
            children: treeArray(subtree[name], ancestors.concat(name)),
            ancestors: ancestors,
            depth: ancestors.length
        };
    });
}
function maxY(d) {
    return d.children ? Math.max.apply(Math, d.children.map(maxY)) : d.y1;
}