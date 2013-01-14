var PhlCrimeMapper = (function($) {    

    // $VARIABLES
    var crimeType = function(code, name) {
        this.code = code;
        this.name = name;
        this.count = 0;
        this.visible = true;
    }

    var crimes = {};

    crimes['100'] = new crimeType(100, 'Homicides');
    crimes['200'] = new crimeType(200, 'Rapes');
    crimes['300'] = new crimeType(300, 'Robberies');
    crimes['400'] = new crimeType(400, 'Aggravated Assaults');
    crimes['500'] = new crimeType(500, 'Burglaries');
    crimes['600'] = new crimeType(600, 'Thefts');

    crimes.clearAllCounts = function() {
        for (var key in this) {
            this[key].count = 0;
        }
    }

    crimes.clearAllLayers = function() {
        for (var key in this) {
            if (this[key].layer) {
                this[key].layer.clearLayers();
            }
        }
    }

    // Doesn't delete layers, merely removing them when user toggles them off
    crimes.removeAllLayers = function() {
        for (var key in this) {
            if (this[key].layer) {
                map.removeLayer(this[key].layer);
            }
        }
    }

    // Oh, Internet Explorer
    $.support.cors = true;

    // $OPEN_DATA
    var bufferService = 'http://gis.phila.gov/ArcGIS/rest/services/Geometry/GeometryServer/buffer';
    var crimesDataService = 'http://gis.phila.gov/ArcGIS/rest/services/PhilaGov/Police_Incidents/MapServer/0/query';
    var relationService = 'http://gis.phila.gov/ArcGIS/rest/services/Geometry/GeometryServer/relation';

    var mobileBufferDistance, phlBoundary;

    var crimeAreaColor = '#FFBC00';    

    var geometry = {}; 

    var isTouch = false; 

    var maxResultsNote = '<h4>NOTE: Only 1000 crimes may be accessed at a time.</h4>';
    
    var mobileResultsNote = '<h4>Visit phlcrimemapper.com on a computer for additional functionality.</h4>';

    var computerResultsNote = '<h4>You can also use phlcrimemapper.com from a mobile device.</h4>';

    var noGeolocationMessage = "Sorry, we couldn't get your current location.  Please make sure that geolocation is enabled on your device.";

    var outsideCityMessage = 'Sorry, you must be within the City of Philadelphia for this application to work. Or, you can use PHL Crime Mapper from any non-mobile device from anywhere.';

    var errorMessage = 'There was an error and it has been reported.  Please try again later.';

    var attribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/license/by/3.0">CC BY 3.0</a>.  Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://creativecommons.org/licenses/by-sa/3.0">CC BY SA</a>. <a href="http://opendataphilly.org/opendata/resource/215/philadelphia-police-part-one-crime-incidents/">Crime data</a> from Philadelphia Police Department.  Application by <a href="http://www.davewalk.net">David Walk</a>. <a href="https://github.com/davewalk/phl-crime-mapper">This application</a> is in no way affiliated with the City of Philadelphia. <a href="mailto:daviddwalk@gmail.com?subject=PHL Crime Mapper Feedback">Please send feedback</a>.';    

    var mapAttribution = new L.Control.Attribution({
        prefix: false,
        position: 'bottomright'
    }); 

    var layer = new L.StamenTileLayer('toner');

    var drawnItems = new L.featureGroup();

    var crimeMarkers = new L.LayerGroup();

    var bufferedAreaPolygon = L.layerGroup();

    mapAttribution.addAttribution(attribution);



    // $MAP_SETUP
    if (L.Browser.touch) {

        // ADD UP CONTROL
        var upControl = L.Control.extend({
            options: {
                position: 'topright'
            },

            onAdd: function(map) {
                
                var className = 'leaflet-control-up';
                var container = L.DomUtil.create('div', 'leaflet-control-up');

                var link = L.DomUtil.create('a', className + '-link', container);
                link.href = '#';
                link.title = 'Go back up';
                
                L.DomEvent.on(link, 'click', function(evt) {
                    L.DomEvent.stopPropagation(evt);
                    $('html,body').animate({
                        scrollTop: $('#smartphone-start').offset().top
                    }, 250);       
                })                
                return container;  
            },
        });        
        
        isTouch = true;

        var map = L.map('map', {
            center: new L.LatLng(39.952335,-75.163789),
            zoom: 13,
            attributionControl: false,
            touchZoom: true,
            dragging: true
        });

        map.addControl(mapAttribution);
        map.addControl(new upControl());
      
    } else {

        var map = L.map('map', {
            center: new L.LatLng(39.952335,-75.163789),
            zoom: 13,
            attributionControl: false
        });

        var drawControl = new L.Control.Draw({
            polyline:  false,
            circle:    false,
            rectangle: false,
            marker:    false,
            polygon: {
                shapeOptions: {
                    color: crimeAreaColor }
            }
        });

        map.addControl(drawControl);        
        map.addControl(mapAttribution);
    }

    map.addLayer(layer); 
    
    // $EVENTS
    $('#dateSlider').bind('userValuesChanged', function(e, bind) {
        if (!$.isEmptyObject(geometry)) {
            _gaq.push(['_trackEvent', 'UserInput', 'DateSliderChange', 'AfterDraw']);
            $('.loading').trigger('loading');
            var queryGeometry = JSON.stringify(geometry);
            fetchCrimes(queryGeometry);
        } else {
            _gaq.push(['_trackEvent', 'UserInput', 'DateSliderChange', 'BeforeDraw']);
        }
    });

    $('.loading').on('loading', function() {
       $('.loading').show();
    });

    $('.loading').on('doneLoading', function() {
        $('.loading').hide();
    });

    map.on('draw:poly-created', function(evt) {
        _gaq.push(['_trackEvent', 'UserInput', 'PolygonDrawn', '']);
        $('.loading').trigger('loading');
        geometry = {};
        drawnItems.clearLayers();
        drawnItems.addLayer(evt.poly);
        var drawnBounds = drawnItems.getBounds();

        map.fitBounds(drawnBounds);
        
        geometry.rings = [];
        var tempArray = [];
        geometry.spatialReference = {'wkid': 4326};

        for (var i=0; i < evt.poly._latlngs.length; i++) {
            var lat = evt.poly._latlngs[i].lat;
            var lng = evt.poly._latlngs[i].lng;
            tempArray.push([lng, lat]);
         }
         
         tempArray.push([evt.poly._latlngs[0].lng, evt.poly._latlngs[0].lat]);
         geometry.rings.push(tempArray);
         var queryGeometry = JSON.stringify(geometry);
         fetchCrimes(JSON.stringify(geometry));
    });

    var formatDate = function(d) {
        var year = d.getFullYear();
        var month = d.getMonth() + 1;
        month = ('0' + month).slice(-2);
        var day = ('0' + d.getDate()).slice(-2);
        return year + '-' + month + '-' + day;
    }

    var fetchCrimes = function(bufferGeometry, minD, maxD) {
        var minDate, maxDate, requestType;
        
        minDate = (!minD) ? formatDate($('#dateSlider').dateRangeSlider('min')) : minD;
        maxDate = (!maxD) ? formatDate($('#dateSlider').dateRangeSlider('max')) : maxD;
        requestType = (!minD) ? 'GET' : 'POST';
        dataType = (requestType === 'GET') ? 'jsonp' : 'json';

        var requestParams = {};
        requestParams.where = 'DISPATCH_DATE>=\'' + minDate + '\' AND DISPATCH_DATE <=\'' + maxDate + '\' AND UCR_GENERAL >= 100 AND UCR_GENERAL <= 600';
        requestParams.geometry = bufferGeometry;
        requestParams.outFields = 'DISPATCH_DATE,DISPATCH_TIME,TEXT_GENERAL_CODE,HOUR,POINT_X,POINT_Y,UCR_GENERAL,LOCATION_BLOCK';
        requestParams.geometryType = 'esriGeometryPolygon';
        requestParams.spatialRel = 'esriSpatialRelContains';
        requestParams.inSR = 4326;
        requestParams.outSR = 4326;
        requestParams.f = 'pjson';
    
        var url = crimesDataService;

        $.ajax({
            url : url,
            dataType: dataType,
            type: requestType,
            data: requestParams,
            success: function(data) { showCrimes(data); },
            error: function(jqXHR, textStatus, errorThrown) {
                $('.loading').trigger('doneLoading');
                alert(errorMessage);
                _gaq.push(['_trackEvent', 'Error', 'Ajax error', 'In fetchCrimes: ' + errorThrown]);
            }
        });
    };    

    map.addLayer(drawnItems);

    $.each(crimes, function(index, crimeType) {
        if (!$.isFunction(crimeType)) {
            crimeType.icon = L.divIcon({
                className: 'icon-map-marker icon-2x ' + crimeType.name,
                iconSize: [19, 29],
                iconAnchor: [10, 28],
                popupAnchor: [1, -25]
            });
 
            crimeType.layer = new L.LayerGroup();
        }
    });

    var showCrimes = function(data) {
        if (!data.features) {
            $('.loading').trigger('doneLoading');
            alert(errorMessage);           
            _gaq.push(['_trackEvent', 'Error', 'Request error', data.error.message + ': '+ data.error.details[0]]);
        }

        crimes.clearAllCounts();
        crimes.clearAllLayers();

        $('#results').empty();
        $('#results').show();
        var crimeTotal = data.features.length >= 1000 ? '1000+' : data.features.length;
        $('#results').html('<h4>There were ' + crimeTotal + ' crimes for the area you selected:</h4>');
        for (var i=0; i < data.features.length; i++) {
            var crime = data.features[i].attributes;
            crimes[crime.UCR_GENERAL].count += 1;
            var popUpContent = '<h4>' + crime.TEXT_GENERAL_CODE + '</h4><h5>DATE: ' + crime.DISPATCH_DATE + '<br />TIME: ' + crime.DISPATCH_TIME + '<br />' + crime.LOCATION_BLOCK + '</h5>';
            var marker = L.marker([crime.POINT_Y, crime.POINT_X], {icon: crimes[crime.UCR_GENERAL].icon, title: crime.TEXT_GENERAL_CODE}).bindPopup(popUpContent); 

            crimes[crime.UCR_GENERAL].layer.addLayer(marker); 
        } 

        $.each(crimes, function(index, crime) {
            if (!$.isFunction(crime)) {
                var $checkbox = $(document.createElement('input')).attr({
                    type: 'checkbox',
                    name: crime.name,
                    value: crime.code,
                    class: 'checkbox',
                    id: crime.name
                });

                if (crime.visible) {
                    $checkbox.attr({ checked: true });
                } else {
                    $checkbox.attr({ checked: false });
                }

                var label = '<h3 style="display:inline"><label for="' + crime.name + '" class="' + crime.name + '">' + crime.count + '    ' + crime.name + '<p></label></h3>';

                var $checkbox_html = $checkbox.html();

                $('#results').append($checkbox);
                $('#results').append(label);
           
                $('.loading').trigger('doneLoading');
                
                if (crime.visible) {
                    map.addLayer(crime.layer);
                } 
             }
       }); 

        $('#results').append(maxResultsNote);
           if (!isTouch) {
               $('#results').append(computerResultsNote);
           }

           if (isTouch) {

               $('#results').append(mobileResultsNote);
      
               bufferedArea = geometry.rings[0];
               var bufferedArray = [];

               if (bufferedAreaPolygon) {
                   bufferedAreaPolygon.clearLayers();
                }
               
                for (i = 0; i < bufferedArea.length; i++) {
                    bufferedArray.push([bufferedArea[i][1], bufferedArea[i][0]]);
                }
       
                var buffer = L.polygon(bufferedArray,
                                       { color: crimeAreaColor,
                                         width: 5,
                                         clickable: false
                                        }                 
                ).addTo(bufferedAreaPolygon);

                bufferedAreaPolygon.addTo(map);

                var bounds = buffer.getBounds();

                map.fitBounds(bounds);

                $('html,body').animate({
                        scrollTop: $('#results').offset().top
                    }, 250);            
        }

        $('#results').change(function(evt) {
        _gaq.push(['_trackEvent', 'UserInput', 'CrimeTypeToggle', evt.target.attributes[1].nodeValue]);
        updateVisibleLayers()    
        });

        var updateVisibleLayers = function() {

            $('.checkbox').each(function() {
                var that = $(this);
                var crimeCode = that.attr('value');
                if ($(this).is(':checked')) {
                    crimes[crimeCode].visible = true;
                } else {
                    crimes[crimeCode].visible = false;
                }
            });

            refreshLayers();        
        }

        var refreshLayers = function() {
            crimes.removeAllLayers()

            $.each(crimes, function(index, crime) {
                if (crime.visible) {
                   map.addLayer(crime.layer);
               }
            });
        }
    }

    var isInCity = function(long, lat) {

        var inCity = true;

        var point = '{"geometryType":"esriGeometryPoint","geometries":[{"x":' + long + ',"y":' + lat + '}]}';

        var boundary = '{"geometryType":"esriGeometryPolygon","geometries":[{"rings":[[[-75.0252,40.1331],[-75.0143,40.1385],[-74.9650,40.1166],[-74.9759,40.0509],[-75.0581,39.9907],[-75.1348,39.9523],[-75.1402,39.8866],[-75.2114,39.8647],[-75.2607,39.8757],[-75.2334,39.9359],[-75.2772,39.9742],[-75.2060,40.0126],[-75.2662,40.0564],[-75.2224,40.0947],[-75.1074,40.0454]]]}]}';

        var url = relationService;

        var requestParams = {};
        requestParams.sr = 4326;
        requestParams.relation = 'esriGeometryRelationWithin';
        requestParams.f = 'pjson';
        requestParams.geometries1 = point;
        requestParams.geometries2 = boundary;

        $.ajax({
            url: url,
            dataType: 'jsonp',
            data: requestParams,
            async: false,
            success: function(data) {
                if (data.relations.length > 0) {
                    inCity = true;
                } else {
                    inCity = false;
                }
            },
            error: function(jqXHR, textStatus, errorThrown) {
                $('.loading').trigger('doneLoading');
                alert(errorMessage);
                _gaq.push(['_trackEvent', 'Error', 'Ajax error', 'In isCoordsInCity: ' + errorThrown]);
            }
        });

        return inCity;      
    }

    var fetchMobileBuffer = function(position) {

        var long = position.coords.longitude;
        var lat = position.coords.latitude;

        var requestParams = {};
        requestParams.geometries = '';
        
        if(isInCity(long, lat)) {            
            requestParams.geometries = long + ',' + lat;
        } else {
            requestParams.geometries = '-75.163789,39.952335'; // City Hall
            alert(outsideCityMessage);
        }
                   
        requestParams.inSR = 4326;
        requestParams.outSR = 4326;
        requestParams.bufferSR = 102113
        requestParams.distances = mobileBufferDistance;
        requestParams.unit = 9002;
        requestParams.unionResults = false;
        requestParams.f = 'pjson';

        var today = new Date();
        var maxDate = formatDate(today);
        var oneMonthAgo = new Date();
        oneMonthAgo.setMonth(today.getMonth() - 1);
        var minDate = formatDate(oneMonthAgo);
            
        $.ajax({
            url : bufferService,
            dataType: 'jsonp',
            type: 'GET',
            data: requestParams,            
            success: function(data) { 
                geometry = data.geometries[0];
                geometry.spatialReference = { wkid : 4326 };
                fetchCrimes(JSON.stringify(geometry), minDate, maxDate); 
            },
            error: function(jqXHR, textStatus, errorThrown) {
                $('.loading').trigger('doneLoading');
                alert(errorMessage);
                _gaq.push(['_trackEvent', 'Error', 'Ajax error', 'In fetchMobileBuffer: ' + errorThrown]);               
            }
        });
    }
    
    var noGeolocationAlert = function() {
        alert(noGeolocationMessage);
        $('.loading').trigger('doneLoading');
        _gaq.push(['_trackEvent', 'Error', 'Geolocation failure', '']);
    }
        
    var currentPositionError = function() {
        noGeolocationAlert();
        $('.loading').trigger('doneLoading');
        _gaq.push(['_trackEvent', 'Error', 'Geolocation failure', '']);
    }

    return {
        showCrimesMobile: function(distance) {
            
            $('.loading').trigger('loading');

            mobileBufferDistance = distance;
            _gaq.push(['_trackEvent', 'UserInput', 'MobileBufferDistance', mobileBufferDistance]);

            if (window.navigator.geolocation) {

                navigator.geolocation.getCurrentPosition(fetchMobileBuffer, 
                                                         currentPositionError, 
                                                         { enableHighAccuracy : true,
                                                           maximumAge: 0,
                                                           timeout: 2000
                                                         });

            } else {
                noGeolocationAlert();
            }
        }
    }
})(jQuery);
