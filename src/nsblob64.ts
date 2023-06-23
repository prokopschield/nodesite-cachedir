import { encode } from '@prokopschield/base64';
import nsblob from 'nsblob';
import nsblob_native from 'nsblob-native-if-available';

export async function store(data: Buffer | string) {
	const hash = await nsblob_native.store(data);

	return encode(Buffer.from(hash, 'hex'));
}

export function close() {
	nsblob.socket.close();
	nsblob_native.socket.close();
}

export default { store, close };
