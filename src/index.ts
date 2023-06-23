import { encode } from 'doge-json';
import fs from 'fs';
import path from 'path';
import { Lock } from 'ps-std';

import nsblob from './nsblob64';

export * as nsblob64 from './nsblob64';

export const upload_blob_queue = new Array<Promise<string>>();

export async function upload_blob(blob: Buffer | string): Promise<string> {
	while (upload_blob_queue.length >= 20) {
		await upload_blob_queue[0];
	}

	const promise = new Promise<string>((resolve) => {
		nsblob.store(blob).then(resolve);
	});

	upload_blob_queue.push(promise);

	promise.then(() =>
		upload_blob_queue.splice(upload_blob_queue.indexOf(promise), 1)
	);

	return promise;
}

export function upload_json(data: any): Promise<string> {
	return upload_blob(encode(data));
}

export const glock = new Lock();

export async function defer(lock: Lock): Promise<Lock> {
	lock.unlock();

	return await glock.wait_and_lock();
}

export const stat_lock = new Lock();

export async function stat(filename: string): Promise<fs.Stats | undefined> {
	const lock = await stat_lock.wait_and_lock();

	try {
		const stats = await fs.promises.stat(filename);

		lock.unlock();

		return stats;
	} finally {
		lock.unlock();
	}
}

export const upload_map = new Map<number, Promise<string | void>>();

export async function upload(filename: string): Promise<string | void> {
	const lock = glock.lock();

	const stats = await stat(filename);

	if (stats) {
		if (upload_map.has(stats.ino)) {
			lock.unlock();

			return upload_map.get(stats.ino);
		}

		const promise = uploadLogic(filename, lock, stats);

		upload_map.set(stats.ino, promise);

		const returnValue = await promise;

		lock.unlock();

		return returnValue;
	}

	lock.unlock();

	console.error(`Failed to upload ${filename}.`);
}

export async function uploadLogic(
	filename: string,
	lock: Lock,
	stats: fs.Stats
) {
	if (stats.isFile()) {
		lock = await defer(lock);

		if (stats.size > 0x100000) {
			const promises = new Array<Promise<string>>();

			const stream = fs.createReadStream(filename, {
				highWaterMark: 0x100000,
			});

			stream.on('data', (chunk) => promises.push(upload_blob(chunk)));

			await new Promise((resolve) => stream.on('end', resolve));

			const hashes = await Promise.all(promises);

			lock.unlock();

			return upload_json(hashes);
		} else {
			const promise = upload_blob(await fs.promises.readFile(filename));

			lock.unlock();

			return await promise;
		}
	} else if (stats.isDirectory()) {
		lock.unlock();

		const names = await fs.promises.readdir(filename);
		const children = names.map((name) => path.resolve(filename, name));
		const promises = children.map(upload);
		const hashes = await Promise.all(promises);

		return upload_json(hashes);
	} else {
		lock.unlock();

		return upload_json(stats);
	}
}
