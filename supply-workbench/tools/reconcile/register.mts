import { register } from 'node:module';

register('./loader.mts', import.meta.url);
