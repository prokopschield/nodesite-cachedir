#!/usr/bin/env node

import argv from '@prokopschield/argv';

import { nsblob64, upload } from '.';

export async function main() {
	for (const file of argv.ordered) {
		console.error(file);
		console.log(await upload(file));
	}

	nsblob64.close();

	process.exitCode = 0;
}

main();
