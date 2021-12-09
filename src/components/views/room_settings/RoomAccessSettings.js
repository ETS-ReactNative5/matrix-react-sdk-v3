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
import {RoomPermalinkCreator, makeGroupPermalink, makeUserPermalink} from "../../../utils/permalinks/Permalinks";
import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";
import {copyPlaintext, selectText} from "../../../utils/strings";
import * as ContextMenu from "../../structures/ContextMenu";
import {toRightOf} from "../../structures/ContextMenu";
import {Room} from "matrix-js-sdk/src/models/room";
import {User} from "matrix-js-sdk/src/models/user";
import {Group} from "matrix-js-sdk/src/models/group";
import {RoomMember} from "matrix-js-sdk/src/models/room-member";
import {MatrixEvent} from "matrix-js-sdk/src/models/event";
import TextWithTooltip from "../elements/TextWithTooltip";
import { generateRandomString } from "../../../tchap/utils/TchapUtils";

// TODO: Merge with ProfileSettings?
export default class RoomAccessSettings extends React.Component {
    static propTypes = {
        roomId: PropTypes.string.isRequired,
    };

    constructor(props) {
        super(props);

        this._onCopyClick = this._onCopyClick.bind(this);
        this._onLinkClick = this._onLinkClick.bind(this);

        this.closeCopiedTooltip = null;

        const client = MatrixClientPeg.get();
        const room = client.getRoom(props.roomId);
        if (!room) throw new Error("Expected a room for ID: ", props.roomId);

        const permalinkCreator = new RoomPermalinkCreator(room);
        permalinkCreator.load();
        const link = permalinkCreator.forRoom();

        let linkSharing = false;
        if (client.isRoomEncrypted(props.roomId) && Tchap.getJoinRules(props.roomId) === "public") {
            linkSharing = true;
        }

        this.state = {
            room,
            accessRules: Tchap.getAccessRules(props.roomId),
            joinRules: Tchap.getJoinRules(props.roomId),
            isForumRoom: Tchap.isRoomForum(props.roomId),
            linkSharing: linkSharing,
            link: link,
        };
    }

    componentWillUnmount() {
        if (this.closeCopiedTooltip) this.closeCopiedTooltip();
    }

    _onLinkClick(e) {
        e.preventDefault();
        selectText(e.target);
    }

    async _onCopyClick(e) {
        e.preventDefault();
        const target = e.target; // copy target before we go async and React throws it away

        const successful = await copyPlaintext(this.state.link);
        const buttonRect = target.getBoundingClientRect();
        const GenericTextContextMenu = sdk.getComponent('context_menus.GenericTextContextMenu');
        const {close} = ContextMenu.createMenu(GenericTextContextMenu, {
            ...toRightOf(buttonRect, 2),
            message: successful ? _t('Copied!') : _t('Failed to copy'),
        });
        // Drop a reference to this close handler for componentWillUnmount
        this.closeCopiedTooltip = target.onmouseleave = close;
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

    _setJoinRules = (room, joinRules) => {
        const client = MatrixClientPeg.get();
        const self = this;
        client.sendStateEvent(room.roomId, "m.room.join_rules", { join_rule: joinRules }, "").then(() => {
            self.setState({
                linkSharing: joinRules === "public",
                joinRules,
            });
            MatrixClientPeg.get().emit("RoomState.joinRules", joinRules);
        }).catch((err) => {
            console.error(err);
            this.setState({
                linkSharing: false,
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
                alias = tmpAlias + generateRandomString(11);
            } else {
                alias = generateRandomString(11);
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

        let warningSharingExtern = null;
        if (this.state.accessRules === "unrestricted" && this.state.joinRules === "public") {
            warningSharingExtern = (
                <div className="tc_ExternSharing_warning">
                    <img src={require("../../../../res/img/tchap/warning.svg")} width="16" height="16"  alt="warning" />
                    <span>{ _t("An invitation is still required for externs, although link access is enabled.") }</span>
                </div>
            );
        }

        let linkUrlField = null;
        if (this.state.linkSharing) {
            linkUrlField = (
                <div className="mx_ShareDialog_matrixto tc_ShareDialog">
                    <a ref="link"
                        href={this.state.link}
                        onClick={this._onLinkClick}
                        className="mx_ShareDialog_matrixto_link"
                    >
                        { this.state.link }
                    </a>
                    <AccessibleTooltipButton
                        title={_t("Copy")}
                        onClick={this._onCopyClick}
                        className="mx_ShareDialog_matrixto_copy"
                    />
                </div>
            );
        }

        const linkSharingSwitchLabelTooltip = (
          <div>
              {_t("Users can join this room with the following link:")}
          </div>
        );

        let linkSharingSwitchLabel = (
            <div>
                { _t("Activate link access to this room") }
                <TextWithTooltip tooltip={linkSharingSwitchLabelTooltip} tooltipClass='mx_Tooltip_dark'>
                    <img className="tc_LinkSharing_Helper" src={require('../../../../res/img/tchap/question_mark.svg')}
                      width={20} height={20}
                      alt={ _t("Room information") } />
                </TextWithTooltip>
            </div>
        );

        const linkSharingUI = (
            <div>
                <LabelledToggleSwitch value={this.state.linkSharing}
                    onChange={ this._onLinkSharingSwitchChange }
                    label={ linkSharingSwitchLabel }
                    disabled={!isCurrentUserAdmin || this.state.isForumRoom}/>
                { warningSharingExtern }
                { linkUrlField }
            </div>
        );

        return (
            <div>
                { accessRule }
                { linkSharingUI }
            </div>
        );
    }
}
