const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Fix peerDependencies - remove the invalid react spec
if (pkg.peerDependencies) {
  // Remove the malformed react entry
  if (pkg.peerDependencies.react) {
    delete pkg.peerDependencies.react;
  }
  
  // Update ethers to accept v5 or v6
  pkg.peerDependencies.ethers = "^5.0.0 || ^6.0.0";
}

// Add peerDependenciesMeta for optional react (correct way)
pkg.peerDependenciesMeta = {
  "react": {
    "optional": true
  }
};

// If you want react as an optional peer dependency, add it properly
if (pkg.peerDependencies) {
  pkg.peerDependencies.react = "^16.8.0 || ^17.0.0 || ^18.0.0";
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Fixed package.json peerDependencies');
