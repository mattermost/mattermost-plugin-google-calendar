const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const packageJson = require('./package.json');
const {chdir} = require('process');

const moduleName = packageJson.customModule.name;
const moduleRepo = packageJson.customModule.repo;
const commitHash = packageJson.customModule.commit;
const modulePath = path.join(__dirname, 'node_modules', moduleName);

if (!moduleRepo || !commitHash) {
    console.error('Module repo or commit hash not specified in package.json');
    process.exit(1);
}

// Clone repo directory if not exists
try {
    if (!fs.existsSync(modulePath)) {
        execSync(`git clone ${moduleRepo} ${modulePath}`);
        console.log(`Successfully cloned ${moduleName} into node_modules.`);
    }
} catch (error) {
    console.error(`Error cloning repo during postinstall: ${error}`);
    process.exit(1);
}


// Checkout the specific commit and npm indtall
try {
    chdir(modulePath);
    execSync(`git checkout ${commitHash}`);
    execSync(`cd webapp && npm i`);
    chdir(`../..`);
} catch (error) {
    console.error(`Error during postinstall: ${error}`);
    process.exit(1);
}
