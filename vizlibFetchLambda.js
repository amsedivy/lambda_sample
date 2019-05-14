'use strict';

var AWS = require("aws-sdk");
var FS = require("fs");
var imagemagick_prebuilt = require( 'imagemagick-prebuilt' );

// set the amazon server farm
AWS.config.region = 'us-east-1';

exports.handler = (event, context, callback) => {
	// set the root path for java executions
	process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];

	// log the event received so if something goes wrong we can look at it in the logs
	console.log(JSON.stringify(event));

	// doubly sure of the region
	AWS.config.update({
		region: 'us-east-1'
	});


	// set up the Dynamo Client code for communication
	var ddb = new AWS.DynamoDB.DocumentClient();
	// get the environs from the event
	var environ = event.env || "pub";

	// set the Dynamo DB to look at based on environment
	var TABLE = environ + '_viz_graphics';
	console.log("TABLE: " + TABLE);

	// if we have what we need to request a graphic
	if (event.playGUID && event.gfxType)
	{
		// store the relevant info into the scope
		var playGUID = event.playGUID;
		var gfxType = event.gfxType.toLowerCase();

		// mark what we're getting in the logs
		console.log(playGUID + " / " + gfxType);

		// build a param object to send to the DyanomDB
		var params = {
			TableName : TABLE,
			KeyConditionExpression: "#playGUID = :playGUID and #gfxType = :gfxType",
			ExpressionAttributeNames:{
				"#playGUID": "playGUID",
				"#gfxType": "gfxType"
			},
			ExpressionAttributeValues: {
				":playGUID": playGUID,
				":gfxType": gfxType
			}
		};

		console.log("get svg!");

		// hit our DB through the Dynamo client code, using the params note: abstract handler
		ddb.query(params, function(err, data) {
			if (err) {
				// log any error returned
				console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
			} else {
				console.log("Query succeeded.");

				// for each item returned (should be 1, but just in case)
				data.Items.forEach(function(item) {
					console.log("you said what in the who now?");
					//FS.writeFile("/tmp/tmp.svg", item.svg, writeHandler); // deprecated for now

					// send the svg attribute of the returned item to be converted.
					// note: abstract function pased as callback
					// TODO: move the callback into a proper function. this is messy JS stuff
					processSvg(item.svg, function(result) {
						console.log("attempting write thru");

						// cpmver the returned image to a base64 string
						var b64 = new Buffer(result, "base64").toString("base64");

						// end the lambda process, returning a JSON with that string as an attribute
						context.succeed({ png: b64 });
					});

				});
			}
		});
	}
	else {
		// we failed, you get nothing
		callback(null,[]);
	}

	function processSvg(svg, callback) {
		var result = new Buffer(0);
		var child_process = require( 'child_process' );

		// invoke the imagemagick library
		imagemagick_prebuilt()
			.then( function( imagemagick_bin_location ) {
				console.log("imagemagick binary installed");

				// spawn a child process which is like node voodoo for additional threads
				var convert_process = child_process.spawn( imagemagick_bin_location, [ "-background", "none", "-density", "500", "-resize", "600x600", "svg:","png:-"] )

				// set handler for data coming backx`
				convert_process.stdout.on('data', function (data) {
					console.log("Receive data from imagemagick");

					// add what he have to our growing buffer stream
					result = Buffer.concat([result, data]);
				});

				// set handler for process complete
				convert_process.stdout
					.on('close', function() {
						console.log("Stdout Closed");
						callback(result);
					});

				// set error handler
				convert_process.stderr.on('data', function (data) {
					console.log('stderr: ' + data);
					callback(data);
				});

				console.log("process svg with imagemagick");

				// write in svg to imagemagick
				convert_process.stdin.write(svg);
				convert_process.stdin.end();

			} );
	}

};
