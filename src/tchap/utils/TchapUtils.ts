/*
Copyright 2021 Léo Mora <l.mora@outlook.fr>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Generate a random alphanumeric string of the given length.
 * @param {number} len The length of the generated string.
 * @return {string} The generated string.
 */
export function generateRandomString(len: number): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let str = '';
    for (let i = 0; i < len; i++) {
        let r = Math.floor(Math.random() * charset.length);
        str += charset.substring(r, r + 1);
    }
    return str;
}

/**
 * Shuffle a given array.
 * @param {array} arr The array to shuffle.
 * @return {array} The shuffeled array.
 */
export function shuffle(arr: Array<any>): Array<any> {
    for (let index = 0; index < arr.length; index++) {
        const r = Math.floor(Math.random() * arr.length);
        const tmp = arr[index];
        arr[index] = arr[r];
        arr[r] = tmp;
    }
    return arr.slice(0, arr.length);
}

/**
 * Capitalize a given string.
 * @param {string} s The sting to capitalize.
 * @return {string} The capitalized string.
 */
export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 *
 * @param room
 * @param eventName
 * @param eventKey
 */
export function getDeepEvent(room: any, eventName: string, eventKey: string): string|undefined {
    const events = room?.currentState?.events;
    const event = events?.get(eventName)?.get("");
    return event?.event?.content[eventKey];
}

