"use strict";

var AWS = require("aws-sdk");
AWS.config.region = "us-east-1";

var BUCKET = "vizlib-color-feed-mk2";
const PREFIX = "/GPK_";
const FILENAME = "/statcastGfxList.json";
var prepend;

exports.handler = (event, context, callback) => {
	let S3 = new AWS.S3();
	var sportcode = "mlb"; // assume mlb // TODO: figure out how to parameterize this

	console.log(event.Records);
	var gfxInfo;

	event.Records.forEach(function(record) {
		// if there is an SNS attribute parse it's message
		if (record.Sns) {
			try {
				// consume message as JSON;
				gfxInfo = JSON.parse(record.Sns.Message);
				prepend = (gfxInfo.env === "dev") ? "dev/" : "pub/";
				
				let gfxItem = constructFeedJSON(gfxInfo);
				checkFile(sportcode, gfxInfo.gamePK, gfxItem);
			} catch (err) {
				console.log("Error processing graphics data from SNS feed: " + err);
			} // end try call

		} // end if statement

	}); // end for each

	/**
	 * Function constructFeedJSON
	 * @param item { Object } information node of the record object
	 * @returns { Object } formatted json object for color feed list
	 */
	function constructFeedJSON(item) {
		return {
			tieBreak: 2.5,
				object: {
					group: "statcastGFX",
					guid: item.playGUID,
					gfxType: item.gfxType,
					data: {
						url: item.viz_url,
						details: {
							playGUID: item.playGUID,
							gamePK: item.gamePK,
							sit: {
						}
					}
				},
				id: null
			}
		}
	}

	function checkFile(sCode, gamePK, item) {
		// get a list of objects from this bucket with this 'prefix' (aka folder path)
		S3.listObjects({
			Bucket: BUCKET,
			Prefix: prepend + sCode + PREFIX + gamePK +"/"
		}, function(err, data) {
			if (err) {
				// if complete failure, give up.
				console.log(err);
				context.fail();
			} else {

				console.log(data);
				if (data.Contents.length === 0 || data.Contents[0].Size === 0) {
					// if there's data, but it's empty, go straight to storage
					console.log("currently empty");
					storeFeedList(sCode, gamePK, item);
				} else {
					// if it's not empty, load that item
					console.log("already exists");
					loadFile(sCode, gamePK, item);
				}
			}
		});
	}

	function loadFile(sCode, gamePK, item) {
		var feed = []; // empty array for later

		// load the item from S3
		S3.getObject({
			Bucket: BUCKET,
			Key: prepend + sCode + PREFIX + gamePK + FILENAME
		}, function (err, data) {
			if (err) {
				// in case it all sucks.
				console.log("Failed to load item, " + err);
				context.fail();
			} else {
				// in case everything is wonderful
				console.log("okay, lets…");

				// debufferize the data contents;
				var decode = new Buffer(data.Body, "application/json").toString("ascii");
				console.log(decode);

				// if there's something to add, do so now
				if (decode) { feed = [].concat(JSON.parse(decode)); }

				// do the redundancy check
				filterFeedList(sCode, gamePK, feed, item);
			}
		});
	}

	function filterFeedList(sCode, gamePK, feed, item) {
		var matchType,
			matchGUID,
			matched = false;

		// iterate through the feed
		for (var i = 0, l = feed.length; i < l; i++) {
			// check the gfxType && playGUID of each item with the new one
			matchType = (feed[i].object.gfxType === item.object.gfxType);
			matchGUID = (feed[i].object.guid === item.object.guid);

			console.log("GFX TYPES ", feed[i].object.gfxType, " / ", item.object.gfxType)
			console.log("PLAY GUIDS ", feed[i].object.guid, " / ", item.object.guid)

			// if they match replace that item
			if (matchType && matchGUID) {
				console.log("that guid / type already existed, so therefore replacing it");
				feed.splice(i, 1, item);
				matched = true;
				break;
			}
		}

		// if nothing matched, just push the new item onto the end
		if (!matched) { feed.push(item); }

		// proceed to saving
		storeFeedList(sCode, gamePK, feed);
	}


	function storeFeedList(sCode, gamePK, feed) {
		// save the JSON array aboject to the specified location, under the generic name
		S3.putObject({
			Bucket: BUCKET,
			Key: prepend + sCode + PREFIX + gamePK + FILENAME,
			ContentType: "application/json",
			Body: JSON.stringify(feed)
		}, function(err) {
			if (err) {
				// log failure
				console.log("failed to write to S3");
				console.log(err);
				context.fail();
			} else {
				// do a jig if you succeed
				console.log("you got you some color feedin' goin' on");
				context.succeed();
			}
		})
	}
};