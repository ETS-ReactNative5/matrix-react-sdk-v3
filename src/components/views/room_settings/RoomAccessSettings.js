/*
Copyright 2019 New Vector Ltd

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

import React from 'react';
import PropTypes from 'prop-types';
import {_t} from "../../../languageHandler";
import {MatrixClientPeg} from "../../../MatrixClientPeg";
import * as sdk from "../../../index";
import Tchap from "../../../tchap/Tchap";
import LabelledToggleSwitch from "../elements/LabelledToggleSwitch";
import Modal from '../../../Modal';
import * as ContextualMenu from "../../structures/ContextMenu";
import {RoomPermalinkCreator} from '../../../utils/permalinks/Permalinks';

// TODO: Merge with ProfileSettings?
export default class RoomAccessSettings extends React.Component {
    static propTypes = {
        roomId: PropTypes.string.isRequired,
    };

    constructor(props) {
        super(props);

        this._onCopyClick = this._onCopyClick.bind(this);
        this._onLinkClick = this._onLinkClick.bind(this);

        const client = MatrixClientPeg.get();
        const room = client.getRoom(props.roomId);
        if (!room) throw new Error("Expected a room for ID: ", props.roomId);

        const permalinkCreator = new RoomPermalinkCreator(room);
        permalinkCreator.load();
        const link = permalinkCreator.forRoom();

        let link_sharing = false;
        if (client.isRoomEncrypted(props.roomId) && Tchap.getJoinRules(props.roomId) === "public") {
            link_sharing = true;
        }

        this.state = {
            room,
            accessRules: Tchap.getAccessRules(props.roomId),
            joinRules: Tchap.getJoinRules(props.roomId),
            isForumRoom: Tchap.isRoomForum(props.roomId),
            link_sharing,
            link: link,
        };
    }

    _selectText(target) {
        const range = document.createRange();
        range.selectNodeContents(target);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    };

    _onLinkClick(e) {
        e.preventDefault();
        this._selectText(e.target);
    };

    async _onCopyClick(e) {
        e.preventDefault();

        this._selectText(this.refs.link);

        let successful;
        try {
            successful = document.execCommand('copy');
        } catch (err) {
            console.error('Failed to copy: ', err);
        }

        const GenericTextContextMenu = sdk.getComponent('context_menus.GenericTextContextMenu');
        const buttonRect = e.target.getBoundingClientRect();

        // The window X and Y offsets are to adjust position when zoomed in to page
        const x = buttonRect.right + window.pageXOffset;
        const y = (buttonRect.top + (buttonRect.height / 2) + window.pageYOffset) - 19;
        const {close} = ContextualMenu.createMenu(GenericTextContextMenu, {
            chevronOffset: 10,
            left: x,
            top: y,
            message: successful ? _t('Copied!') : _t('Failed to copy'),
        }, false);
        e.target.onmouseleave = close;
    };

    _getGuestAccessRules(room) {
        const stateEventType = "m.room.guest_access";
        const keyName = "guest_access";
        const defaultValue = "can_join";
        const event = room.currentState.getStateEvents(stateEventType, '');
        if (!event) {
            return defaultValue;
        }
        const content = event.getContent();
        return keyName in content ? content[keyName] : defaultValue;
    };

    _generateRandomString(len) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let str = '';
        for (let i = 0; i < len; i++) {
            let r = Math.floor(Math.random() * charset.length);
            str += charset.substring(r, r + 1);
        }
        return str;0
    };

    _setJoinRules = (room, joinRules) => {
        const client = MatrixClientPeg.get();
        const self = this;
        client.sendStateEvent(room.roomId, "m.room.join_rules", { join_rule: joinRules }, "").then(() => {
            self.setState({
                link_sharing: joinRules === "public",
                joinRules,
            });
        }).catch((err) => {
            console.error(err);
            this.setState({
                link_sharing: false,
            });
            if (err.errcode === "M_FORBIDDEN" && this.state.accessRules === "unrestricted") {
                const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
                Modal.createTrackedDialog('Failure to create room', '', ErrorDialog, {
                    title: _t("Failed to open link access for this room"),
                    description: _t("This change is not currently supported because externs are allowed to join this room."),
                });
            }
        });
    };

    _setUpRoomByLink = (room) => {
        const client = MatrixClientPeg.get();
        if (!room.getCanonicalAlias()) {
            let alias = "";
            if (room.name) {
                const tmpAlias = room.name.replace(/[^a-z0-9]/gi, "");
                alias = tmpAlias + this._generateRandomString(7);
            } else {
                alias = this._generateRandomString(7);
            }
            alias = `#${alias}:${client.getDomain()}`;
            client.createAlias(alias, room.roomId).then(() => {
                client.sendStateEvent(room.roomId, "m.room.canonical_alias",
                    { alias }, "").then(() => {
                    this._setJoinRules(room, "public");
                }).catch((err) => {
                    console.error(err)
                });
            }).catch(err => {
                console.error(err);
            });
        } else {
            this._setJoinRules(room, "public");
        }
    };

    _onLinkSharingSwitchChange = (e) => {
        const client = MatrixClientPeg.get();
        const room = client.getRoom(this.props.roomId);
        if (e) {
            if (this._getGuestAccessRules(room) === "can_join") {
                client.sendStateEvent(room.roomId, "m.room.guest_access", {guest_access: "forbidden"}, "").then(() => {
                    this._setUpRoomByLink(room);
                }).catch((err) => {
                    console.error(err);
                });
            } else {
                this._setUpRoomByLink(room);
            }
        } else {
            this._setJoinRules(room, "invite");
        }
    };

    _onExternAllowedSwitchChange = () => {
        const self = this;
        const accessRules = this.state.accessRules;
        const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
        Modal.createTrackedDialog('Allow the externals to join this room', '', QuestionDialog, {
            title: _t('Allow the externals to join this room'),
            description: ( _t('This action is irreversible.') + " " + _t('Are you sure you want to allow the externals to join this room ?')),
            onFinished: (confirm) => {
                if (confirm) {
                    MatrixClientPeg.get().sendStateEvent(
                        self.props.roomId, "im.vector.room.access_rules",
                        { rule: 'unrestricted' },
                        "",
                    ).then(() => {
                        self.setState({
                            accessRules: 'unrestricted'
                        });
                    }).catch(err => {
                        console.error(err)
                        self.setState({
                            accessRules
                        });
                        if (err.errcode === "M_FORBIDDEN" && self.state.joinRules === "public") {
                            const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
                            Modal.createTrackedDialog('Failure to create room', '', ErrorDialog, {
                                title: _t("Failed to open this room to externs"),
                                description: _t("This change is not currently supported because this room is accessible by link."),
                            });
                        }
                    })
                } else {
                    self.setState({
                        accessRules
                    });
                }
            },
        });
    };

    render() {
        const client = MatrixClientPeg.get();
        const room = client.getRoom(this.props.roomId);
        const isCurrentUserAdmin = room.getMember(client.getUserId()).powerLevelNorm >= 100;
        const permalinkCreator = new RoomPermalinkCreator(room);
        permalinkCreator.load();

        let link = this.state.link;
        const newLink = permalinkCreator.forRoom();
        if (link !== newLink) {
            this.setState({
                link: newLink,
            })
        }

        let accessRule = null;
        if (!this.state.isForumRoom) {
            accessRule = (
                <LabelledToggleSwitch value={this.state.accessRules === "unrestricted"}
                                      onChange={ this._onExternAllowedSwitchChange }
                                      label={ _t('Allow the externals to join this room') }
                                      disabled={ this.state.accessRules === "unrestricted"  || !isCurrentUserAdmin} />
            );
        }

        let linkSharingUI = null;
        if (!this.state.isForumRoom) {
            let linkUrlField = null;
            if (this.state.link_sharing) {
                linkUrlField = (
                    <div className="mx_ShareDialog_matrixto tc_ShareDialog">
                        <a ref="link"
                            href={this.state.link}
                            onClick={this._onLinkClick}
                            className="mx_ShareDialog_matrixto_link"
                        >
                            { this.state.link }
                        </a>
                        <a href={this.state.link} className="mx_ShareDialog_matrixto_copy" onClick={this._onCopyClick}>
                            { _t('COPY') }
                            <div>&nbsp;</div>
                        </a>
                    </div>
                );
            }

            let linkSharingSwitchLabel = (
                <div>
                    { _t("Activate link access to this room") }
                    <img className="tc_LinkSharing_Helper" src={require('../../../../res/img/tchap/question_mark.svg')}
                        width={20} height={20}
                        title={ _t("Users can join this room with the following link:") }
                        alt={ _t("Room information") } />
                </div>
            );

            linkSharingUI = (
                <div>
                    <LabelledToggleSwitch value={this.state.link_sharing}
                        onChange={ this._onLinkSharingSwitchChange }
                        label={ linkSharingSwitchLabel }
                        disabled={!isCurrentUserAdmin}/>
                    { linkUrlField }
                </div>
            );
        }

        return (
            <div>
                { accessRule }
                { linkSharingUI }
            </div>
        );
    }
}
