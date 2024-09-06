const flexWerks = require('./lib/flexWerks'); //Import flexWerks script
const process = require('process'); // Import the process module to access command-line arguments

console.log('***Flex Werks v2.0***\n');

if (process.argv.length > 2) {
  const arg1 = process.argv[2]; // Get the third command-line argument

  if (arg1 === 'getAllServiceAreas' || arg1 === '--w') {
    console.log('\nYour service area options:');
    console.log(flexWerks.getAllServiceAreas());
  } else if(arg1 === 'validateChalllenge' || arg1 === '--v') {
    flexWerks.validateChallenge();
  } else if(arg1 === 'validateChallengeM' || arg1 === '--vm') {
    flexWerks.validateChallenge(true);
  } else if(arg1 === 'newToken' || arg1 === '--t') {
    flexWerks.getFlexAccessToken();
  } else {
    console.log('Invalid argument provided.');
  }
} else {
  flexWerks.run();
}