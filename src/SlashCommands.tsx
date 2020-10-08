/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2018 New Vector Ltd
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>
Copyright 2020 The Matrix.org Foundation C.I.C.

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


import * as React from 'react';

import {MatrixClientPeg} from './MatrixClientPeg';
import dis from './dispatcher/dispatcher';
import * as sdk from './index';
import {_t, _td} from './languageHandler';
import Modal from './Modal';
import MultiInviter from './utils/MultiInviter';
import { linkifyAndSanitizeHtml } from './HtmlUtils';
import QuestionDialog from "./components/views/dialogs/QuestionDialog";
import WidgetUtils from "./utils/WidgetUtils";
import {textToHtmlRainbow} from "./utils/colour";
import { getAddressType } from './UserAddress';
import { abbreviateUrl } from './utils/UrlUtils';
import { getDefaultIdentityServerUrl, useDefaultIdentityServer } from './utils/IdentityServerUtils';
import {isPermalinkHost, parsePermalink} from "./utils/permalinks/Permalinks";
import {inviteUsersToRoom} from "./RoomInvite";
import { WidgetType } from "./widgets/WidgetType";
import { Jitsi } from "./widgets/Jitsi";
import { parseFragment as parseHtml } from "parse5";
import BugReportDialog from "./components/views/dialogs/BugReportDialog";
import { ensureDMExists } from "./createRoom";
import { ViewUserPayload } from "./dispatcher/payloads/ViewUserPayload";
import { Action } from "./dispatcher/actions";
import { EffectiveMembership, getEffectiveMembership, leaveRoomBehaviour } from "./utils/membership";
import SdkConfig from "./SdkConfig";
import SettingsStore from "./settings/SettingsStore";
import {UIFeature} from "./settings/UIFeature";

// XXX: workaround for https://github.com/microsoft/TypeScript/issues/31816
interface HTMLInputEvent extends Event {
    target: HTMLInputElement & EventTarget;
}

const singleMxcUpload = async (): Promise<any> => {
    return new Promise((resolve) => {
        const fileSelector = document.createElement('input');
        fileSelector.setAttribute('type', 'file');
        fileSelector.onchange = (ev: HTMLInputEvent) => {
            const file = ev.target.files[0];

            const UploadConfirmDialog = sdk.getComponent("dialogs.UploadConfirmDialog");
            Modal.createTrackedDialog('Upload Files confirmation', '', UploadConfirmDialog, {
                file,
                onFinished: (shouldContinue) => {
                    resolve(shouldContinue ? MatrixClientPeg.get().uploadContent(file) : null);
                },
            });
        };

        fileSelector.click();
    });
};

export const CommandCategories = {
    "messages": _td("Messages"),
    "actions": _td("Actions"),
    "admin": _td("Admin"),
    "advanced": _td("Advanced"),
    "other": _td("Other"),
};

type RunFn = ((roomId: string, args: string, cmd: string) => {error: any} | {promise: Promise<any>});

interface ICommandOpts {
    command: string;
    aliases?: string[];
    args?: string;
    description: string;
    runFn?: RunFn;
    category: string;
    hideCompletionAfterSpace?: boolean;
    isEnabled?(): boolean;
}

export class Command {
    command: string;
    aliases: string[];
    args: undefined | string;
    description: string;
    runFn: undefined | RunFn;
    category: string;
    hideCompletionAfterSpace: boolean;
    _isEnabled?: () => boolean;

    constructor(opts: ICommandOpts) {
        this.command = opts.command;
        this.aliases = opts.aliases || [];
        this.args = opts.args || "";
        this.description = opts.description;
        this.runFn = opts.runFn;
        this.category = opts.category || CommandCategories.other;
        this.hideCompletionAfterSpace = opts.hideCompletionAfterSpace || false;
        this._isEnabled = opts.isEnabled;
    }

    getCommand() {
        return `/${this.command}`;
    }

    getCommandWithArgs() {
        return this.getCommand() + " " + this.args;
    }

    run(roomId: string, args: string, cmd: string) {
        // if it has no runFn then its an ignored/nop command (autocomplete only) e.g `/me`
        if (!this.runFn) return reject(_t("Command error"));
        return this.runFn.bind(this)(roomId, args, cmd);
    }

    getUsage() {
        return _t('Usage') + ': ' + this.getCommandWithArgs();
    }

    isEnabled() {
        return this._isEnabled ? this._isEnabled() : true;
    }
}

function reject(error) {
    return {error};
}

function success(promise?: Promise<any>) {
    return {promise};
}

/* Disable the "unexpected this" error for these commands - all of the run
 * functions are called with `this` bound to the Command instance.
 */

export const Commands = [
    new Command({
        command: 'shrug',
        args: '<message>',
        description: _td('Prepends ¯\\_(ツ)_/¯ to a plain-text message'),
        runFn: function(roomId, args) {
            let message = '¯\\_(ツ)_/¯';
            if (args) {
                message = message + ' ' + args;
            }
            return success(MatrixClientPeg.get().sendTextMessage(roomId, message));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: 'lenny',
        args: '<message>',
        description: _td('Prepends ( ͡° ͜ʖ ͡°) to a plain-text message'),
        runFn: function(roomId, args) {
            let message = '( ͡° ͜ʖ ͡°)';
            if (args) {
                message = message + ' ' + args;
            }
            return success(MatrixClientPeg.get().sendTextMessage(roomId, message));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: 'plain',
        args: '<message>',
        description: _td('Sends a message as plain text, without interpreting it as markdown'),
        runFn: function(roomId, messages) {
            return success(MatrixClientPeg.get().sendTextMessage(roomId, messages));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: 'html',
        args: '<message>',
        description: _td('Sends a message as html, without interpreting it as markdown'),
        runFn: function(roomId, messages) {
            return success(MatrixClientPeg.get().sendHtmlMessage(roomId, messages, messages));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "rainbow",
        description: _td("Sends the given message coloured as a rainbow"),
        args: '<message>',
        runFn: function(roomId, args) {
            if (!args) return reject(this.getUserId());
            return success(MatrixClientPeg.get().sendHtmlMessage(roomId, args, textToHtmlRainbow(args)));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "rainbowme",
        description: _td("Sends the given emote coloured as a rainbow"),
        args: '<message>',
        runFn: function(roomId, args) {
            if (!args) return reject(this.getUserId());
            return success(MatrixClientPeg.get().sendHtmlEmote(roomId, args, textToHtmlRainbow(args)));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "help",
        description: _td("Displays list of commands with usages and descriptions"),
        runFn: function() {
            const SlashCommandHelpDialog = sdk.getComponent('dialogs.SlashCommandHelpDialog');

            Modal.createTrackedDialog('Slash Commands', 'Help', SlashCommandHelpDialog);
            return success();
        },
        category: CommandCategories.advanced,
    }),
    // Command definitions for autocompletion ONLY:
    // /me is special because its not handled by SlashCommands.js and is instead done inside the Composer classes
    new Command({
        command: "me",
        args: '<message>',
        description: _td('Displays action'),
        category: CommandCategories.messages,
        hideCompletionAfterSpace: true,
    }),
];

// build a map from names and aliases to the Command objects.
export const CommandMap = new Map();
Commands.forEach(cmd => {
    CommandMap.set(cmd.command, cmd);
    cmd.aliases.forEach(alias => {
        CommandMap.set(alias, cmd);
    });
});

export function parseCommandString(input: string) {
    // trim any trailing whitespace, as it can confuse the parser for
    // IRC-style commands
    input = input.replace(/\s+$/, '');
    if (input[0] !== '/') return {}; // not a command

    const bits = input.match(/^(\S+?)(?: +((.|\n)*))?$/);
    let cmd;
    let args;
    if (bits) {
        cmd = bits[1].substring(1).toLowerCase();
        args = bits[2];
    } else {
        cmd = input;
    }

    return {cmd, args};
}

/**
 * Process the given text for /commands and return a bound method to perform them.
 * @param {string} roomId The room in which the command was performed.
 * @param {string} input The raw text input by the user.
 * @return {null|function(): Object} Function returning an object with the property 'error' if there was an error
 * processing the command, or 'promise' if a request was sent out.
 * Returns null if the input didn't match a command.
 */
export function getCommand(roomId: string, input: string) {
    const {cmd, args} = parseCommandString(input);

    if (CommandMap.has(cmd) && CommandMap.get(cmd).isEnabled()) {
        return () => CommandMap.get(cmd).run(roomId, args, cmd);
    }
}
