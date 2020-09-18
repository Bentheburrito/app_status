const Particle = require('particle-api-js');
const pm2 = require('pm2');

require('dotenv').config();

const availableLeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

let particle = new Particle();

particle.login({ username: process.env.PARTICLE_EMAIL, password: process.env.PARTICLE_PASSWORD }).then(async loginRes => {
	const accessToken = loginRes.body.access_token;

	let deviceID;
	const deviceRes = await particle.listDevices({ auth: accessToken });
	if (deviceRes.body[0].connected) {
			
		deviceID = deviceRes.body[0].id;
		console.log('Particle device logged in.');
	} else return console.log('COULD NOT FIND DEVICE ID');
	
	const getOptions = (functionName, args) => {
		return {
			deviceId: deviceID,
			name: functionName,
			argument: JSON.stringify(args),
			auth: accessToken
		}
	}
	
	let appStatuses = {}; // {pm2_id: {ledNum: int, lastUpdate: latestPM2Status} }
	
	setInterval(() => {
		console.log('Running Interval')
		pm2.list(async (e, list) => {
			if (e) return console.log(`Error getting pm2 list: ${e}`);
		
			for (const app of list) {
				appStatus = appStatuses[app.pm_id]
				if (!appStatus) {
					const ledNum = availableLeds.pop();
					if (!ledNum) {
						console.log('Cannot update app statuses: All LEDs are taken!');
						continue;
					}
					appStatus = appStatuses[app.pm_id] = { ledNum, lastUpdate: undefined };	
				}
				if (app.pm2_env.status === appStatus.lastUpdate) continue;
				console.log(getOptions("setOnline", appStatus.ledNum))

				if (app.pm2_env.status === "online")
					await particle.callFunction(getOptions("setOnline", appStatus.ledNum)).catch((e) => {
						if (e.body.error == 'Timed out.') return;
						console.log('error on particle.callFunction:', e);
					});
				else if (["errored", "stopping", "stopped"].some(status => status === app.pm2_env.status)) 
					particle.callFunction(getOptions("setOffline", appStatus.ledNum)).catch((e) => {
						if (e.body.error == 'Timed out.') return;
						console.log('error on particle.callFunction:', e);
					});
				else if (app.pm2_env.status === "launching") 
					particle.callFunction(getOptions("setLaunching", appStatus.ledNum)).catch((e) => {
						if (e.body.error == 'Timed out.') return;
						console.log('error on particle.callFunction:', e);
					});
				else {
					console.log(`No match for ${app.pm2_env.status}`);
					continue;
				}
				appStatus.lastUpdate = app.pm2_env.status;
			}
		})
	}, 5000);
}).catch(e => { return console.log('Could not log in.', e) });

