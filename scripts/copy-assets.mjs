import { cpSync, existsSync, mkdirSync } from 'node:fs';

const assetCopies = [
	{
		sourceFile: 'src/assets/bank-icon.svg',
		targetDir: 'dist/src/nodes/RevolutBusinessWebhook',
		fileName: 'bank-icon.svg',
	},
	{
		sourceFile: 'src/assets/bank-icon.svg',
		targetDir: 'dist/src/credentials',
		fileName: 'bank-icon.svg',
	},
	{
		sourceFile: 'src/assets/bank-icon.svg',
		targetDir: 'dist/src/nodes/RevolutBusinessWebhookTrigger',
		fileName: 'bank-icon.svg',
	},
];

for (const { sourceFile, targetDir, fileName } of assetCopies) {
	if (!existsSync(sourceFile)) {
		continue;
	}

	mkdirSync(targetDir, { recursive: true });
	cpSync(sourceFile, `${targetDir}/${fileName}`);
}
