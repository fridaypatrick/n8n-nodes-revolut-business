import { cpSync, existsSync, mkdirSync } from 'node:fs';

const assetCopies = [
	{
		sourceDir: 'src/nodes/RevolutBusinessWebhook',
		targetDir: 'dist/src/nodes/RevolutBusinessWebhook',
		fileName: 'revolut.svg',
	},
	{
		sourceDir: 'src/nodes/RevolutBusinessWebhookTrigger',
		targetDir: 'dist/src/nodes/RevolutBusinessWebhookTrigger',
		fileName: 'revolut.svg',
	},
];

for (const { sourceDir, targetDir, fileName } of assetCopies) {
	const sourceFile = `${sourceDir}/${fileName}`;
	if (!existsSync(sourceFile)) {
		continue;
	}

	mkdirSync(targetDir, { recursive: true });
	cpSync(sourceFile, `${targetDir}/${fileName}`);
}
