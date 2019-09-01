var AWS = require('aws-sdk');

exports.handler = (event, context, callback) => {

	console.log("Triggered");
	console.log(event);
	console.log(context);

	var ec2 = new AWS.EC2();
	var cloudwatchevents = new AWS.CloudWatchEvents();
	var lambda = new AWS.Lambda();
	var newAMIID;

	function waterfall(arr, cb) {
		function process(arr, cb, err, data) {
			if (err) { cb(err); return; }
			if (arr.length === 0) { cb(null, data); return; }
			var forwardArgs = [process.bind(null, arr, cb)];
			if (data) { forwardArgs.unshift(data) }
			arr.shift().apply(null, forwardArgs)
		}
		process(arr, cb)
	}

	function series(arr, cb) {
		function process(arr, cb, err) {
			if(err) { cb(err); return; }
			if(arr.length === 0) { cb(null); return; }
			arr.shift().call(null, process.bind(null, arr, cb))
		}
		process(arr, cb)
	}

	waterfall([
		function (cb) {
			ec2.describeImages({
				Owners: ['self'],
				Filters: [{
					Name: 'tag:cloudrig',
					Values: ['true']
				},{
					Name: 'tag:cloudrig:cloudformation:stackid',
					Values: ['${AWS::StackId}']
				}]
			}, cb)
		},

		function (data, cb) {
			if (data.Images.length === 0) {
				console.log("No image saved. Returning.");
				return;
			} else {
				var imageState = data.Images[0].State;
				newAMIID = data.Images[0].ImageId;
				if (imageState === "pending") {
					console.log('Image is still pending. Rescheduling the lambda...');
					return;
				} else if (imageState === "available") {
					console.log("Image is " + newAMIID + " is ready");
					cb();
				} else {
					console.log('An error occurred while creating the image ' + newAMIID + ' (state = ' + imageState + ') ')
				}
			}
		},

		function (data, cb) {
			console.log("Fetching the current CloudFormation parameters...");
			cloudformation.describeStacks({
				StackName: process.env.CLOUDRIG_CLOUDFORMATION_STACK_NAME
			}, cb)
		},
		function (data, cb) {
			console.log("Update the stack parameters with the new AMI Id...");
			const cloudformationParameters = data.Stacks[0].Parameters;
			for (i = 0; i < cloudformationParameters.length; i++) {
				// Set all the parameters to use previous value
				parameter = cloudformationParameters[i];

				// If the parameter is the Image ID, we replace its value
				if (parameter.get('ParameterKey') === 'InstanceAMIId') {
					parameter.set('ParameterKey', newAMIID);
				} else {
					parameter.delete('ParameterValue');
					parameter.set('UsePreviousValue', true);
				}
			}

			cloudformation.updateStack({
				StackName: process.env.CLOUDRIG_CLOUDFORMATION_STACK_NAME,
				UsePreviousTemplate: true,
				Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
				Parameters: cloudformationParameters
			}, cb);
		},

		function(cb) {
			console.log("Disabling the CloudWatch rule");
			cloudwatchevents.disableRule({
				Name: "cloudrig-save"
			}, cb)
		}

	], function(err) {
		if (err) { console.log(err); callback(err); return; }
		console.log("Done");
		callback();
	});
};
