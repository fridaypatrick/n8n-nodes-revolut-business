const crypto = require('node:crypto');

function sanitizePrereleaseIdentifier(branchName) {
  const sanitized = branchName
    .replace(/[^0-9A-Za-z-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const safeName = sanitized || 'branch';
  const shortHash = crypto.createHash('sha256').update(branchName).digest('hex').slice(0, 6);

  return `branch-${safeName}-${shortHash}`;
}

const currentBranch = process.env.GITHUB_REF_NAME || process.env.BRANCH_NAME || 'main';
const isMainBranch = currentBranch === 'main';
const prereleaseIdentifier = sanitizePrereleaseIdentifier(currentBranch);

const packPlugin = [
  '@semantic-release/exec',
  {
    prepareCmd: 'rm -rf release && mkdir -p release && npm pack --pack-destination release',
  },
];

module.exports = {
  branches: isMainBranch
    ? ['main']
    : ['main', { name: currentBranch, prerelease: prereleaseIdentifier, channel: prereleaseIdentifier }],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    packPlugin,
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'release/*.tgz',
            label: 'npm package tarball',
          },
        ],
      },
    ],
  ],
};
