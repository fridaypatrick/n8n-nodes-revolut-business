import { cpSync, existsSync, mkdirSync } from 'node:fs';

const assetCopies = [
	{
		sourceFile: 'src/assets/revolut.svg',
		targetDir: 'dist/src/nodes/RevolutBusinessWebhook',
		fileName: 'revolut.svg',
	},
	{
		sourceFile: 'src/assets/revolut.svg',
		targetDir: 'dist/src/credentials',
		fileName: 'revolut.svg',
	},
	{
		sourceFile: 'src/assets/revolut.svg',
		targetDir: 'dist/src/nodes/RevolutBusinessWebhookTrigger',
		fileName: 'revolut.svg',
	},
];

for (const { sourceFile, targetDir, fileName } of assetCopies) {
	if (!existsSync(sourceFile)) {
		continue;
	}

	mkdirSync(targetDir, { recursive: true });
	cpSync(sourceFile, `${targetDir}/${fileName}`);
}
