/*
Copyright 2015-2020 The Matrix.org Foundation C.I.C.

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
import Matrix from 'matrix-js-sdk';
import { _t, _td } from '../../languageHandler';
import {MatrixClientPeg} from '../../MatrixClientPeg';
import Resend from '../../Resend';
import dis from '../../dispatcher/dispatcher';
import {messageForResourceLimitError, messageForSendError} from '../../utils/ErrorUtils';
import {Action} from "../../dispatcher/actions";
import {inviteMultipleToRoom} from "../../RoomInvite";
import DMRoomMap from "../../utils/DMRoomMap";
import Tchap from "../../tchap/Tchap";
import AccessibleButton from "../views/elements/AccessibleButton";

const STATUS_BAR_HIDDEN = 0;
const STATUS_BAR_EXPANDED = 1;
const STATUS_BAR_EXPANDED_LARGE = 2;

function getUnsentMessages(room) {
    if (!room) { return []; }
    return room.getPendingEvents().filter(function(ev) {
        return ev.status === Matrix.EventStatus.NOT_SENT;
    });
}

export default class RoomStatusBar extends React.Component {
    static propTypes = {
        // the room this statusbar is representing.
        room: PropTypes.object.isRequired,

        // true if the room is being peeked at. This affects components that shouldn't
        // logically be shown when peeking, such as a prompt to invite people to a room.
        isPeeking: PropTypes.bool,

        // callback for when the user clicks on the 'resend all' button in the
        // 'unsent messages' bar
        onResendAllClick: PropTypes.func,

        // callback for when the user clicks on the 'cancel all' button in the
        // 'unsent messages' bar
        onCancelAllClick: PropTypes.func,

        // callback for when the user clicks on the 'invite others' button in the
        // 'you are alone' bar
        onInviteClick: PropTypes.func,

        // callback for when we do something that changes the size of the
        // status bar. This is used to trigger a re-layout in the parent
        // component.
        onResize: PropTypes.func,

        // callback for when the status bar can be hidden from view, as it is
        // not displaying anything
        onHidden: PropTypes.func,

        // callback for when the status bar is displaying something and should
        // be visible
        onVisible: PropTypes.func,
    };

    state = {
        syncState: MatrixClientPeg.get().getSyncState(),
        syncStateData: MatrixClientPeg.get().getSyncStateData(),
        unsentMessages: getUnsentMessages(this.props.room),
    };

    componentDidMount() {
        MatrixClientPeg.get().on("sync", this.onSyncStateChange);
        MatrixClientPeg.get().on("Room.localEchoUpdated", this._onRoomLocalEchoUpdated);

        this._checkSize();
    }

    componentDidUpdate() {
        this._checkSize();
    }

    componentWillUnmount() {
        // we may have entirely lost our client as we're logging out before clicking login on the guest bar...
        const client = MatrixClientPeg.get();
        if (client) {
            client.removeListener("sync", this.onSyncStateChange);
            client.removeListener("Room.localEchoUpdated", this._onRoomLocalEchoUpdated);
        }
    }

    onSyncStateChange = (state, prevState, data) => {
        if (state === "SYNCING" && prevState === "SYNCING") {
            return;
        }
        this.setState({
            syncState: state,
            syncStateData: data,
        });
    };

    _onResendAllClick = () => {
        Resend.resendUnsentEvents(this.props.room);
        dis.fire(Action.FocusComposer);
    };

    _onCancelAllClick = () => {
        Resend.cancelUnsentEvents(this.props.room);
        dis.fire(Action.FocusComposer);
    };

    _onRoomLocalEchoUpdated = (event, room, oldEventId, oldStatus) => {
        if (room.roomId !== this.props.room.roomId) return;

        this.setState({
            unsentMessages: getUnsentMessages(this.props.room),
        });
    };

    _onReinviteClick = () => {
        const dmUserId = DMRoomMap.shared().getUserIdForRoomId(this.props.room.roomId);
        inviteMultipleToRoom(this.props.room.roomId, [dmUserId]).then().catch(err => {
            console.error("Failed to invite user to the room")
            console.error(err)
        });
    };

    // Check whether current size is greater than 0, if yes call props.onVisible
    _checkSize() {
        if (this._getSize()) {
            if (this.props.onVisible) this.props.onVisible();
        } else {
            if (this.props.onHidden) this.props.onHidden();
        }
    }

    // We don't need the actual height - just whether it is likely to have
    // changed - so we use '0' to indicate normal size, and other values to
    // indicate other sizes.
    _getSize() {
        if (this._shouldShowConnectionError()) {
            return STATUS_BAR_EXPANDED;
        } else if (this.state.unsentMessages.length > 0) {
            return STATUS_BAR_EXPANDED_LARGE;
        }
        return STATUS_BAR_HIDDEN;
    }

    _shouldShowConnectionError() {
        // no conn bar trumps the "some not sent" msg since you can't resend without
        // a connection!
        // There's one situation in which we don't show this 'no connection' bar, and that's
        // if it's a resource limit exceeded error: those are shown in the top bar.
        const errorIsMauError = Boolean(
            this.state.syncStateData &&
            this.state.syncStateData.error &&
            this.state.syncStateData.error.errcode === 'M_RESOURCE_LIMIT_EXCEEDED',
        );
        return this.state.syncState === "ERROR" && !errorIsMauError;
    }

    _getUnsentMessageContent() {
        const unsentMessages = this.state.unsentMessages;
        if (!unsentMessages.length) return null;

        let title;

        let consentError = null;
        let resourceLimitError = null;
        for (const m of unsentMessages) {
            if (m.error && m.error.errcode === 'M_CONSENT_NOT_GIVEN') {
                consentError = m.error;
                break;
            } else if (m.error && m.error.errcode === 'M_RESOURCE_LIMIT_EXCEEDED') {
                resourceLimitError = m.error;
                break;
            }
        }
        if (consentError) {
            title = _t(
                "You can't send any messages until you review and agree to " +
                "<consentLink>our terms and conditions</consentLink>.",
                {},
                {
                    'consentLink': (sub) =>
                        <a href={consentError.data && consentError.data.consent_uri} target="_blank">
                            { sub }
                        </a>,
                },
            );
        } else if (resourceLimitError) {
            title = messageForResourceLimitError(
                resourceLimitError.data.limit_type,
                resourceLimitError.data.admin_contact, {
                'monthly_active_user': _td(
                    "Your message wasn't sent because this homeserver has hit its Monthly Active User Limit. " +
                    "Please <a>contact your service administrator</a> to continue using the service.",
                ),
                '': _td(
                    "Your message wasn't sent because this homeserver has exceeded a resource limit. " +
                    "Please <a>contact your service administrator</a> to continue using the service.",
                ),
            });
        } else if (
            unsentMessages.length === 1 &&
            unsentMessages[0].error &&
            unsentMessages[0].error.data &&
            unsentMessages[0].error.data.error
        ) {
            title = messageForSendError(unsentMessages[0].error.data) || unsentMessages[0].error.data.error;
        } else {
            title = _t('%(count)s of your messages have not been sent.', { count: unsentMessages.length });
        }

        const content = _t("%(count)s <resendText>Resend all</resendText> or <cancelText>cancel all</cancelText> " +
            "now. You can also select individual messages to resend or cancel.",
            { count: unsentMessages.length },
            {
                'resendText': (sub) =>
                    <a className="mx_RoomStatusBar_resend_link" key="resend" onClick={this._onResendAllClick}>{ sub }</a>,
                'cancelText': (sub) =>
                    <a className="mx_RoomStatusBar_resend_link" key="cancel" onClick={this._onCancelAllClick}>{ sub }</a>,
            },
        );
        return <div className="mx_RoomStatusBar_connectionLostBar">
            <img src={require("../../../res/img/feather-customised/warning-triangle.svg")} width="24" height="24" title={_t("Warning")} alt="" />
            <div>
                <div className="mx_RoomStatusBar_connectionLostBar_title">
                    { title }
                </div>
                <div className="mx_RoomStatusBar_connectionLostBar_desc">
                    { content }
                </div>
            </div>
        </div>;
    }

    // return suitable content for the main (text) part of the status bar.
    _getContent() {
        if (this._shouldShowConnectionError()) {
            return (
                <div className="mx_RoomStatusBar_connectionLostBar">
                    <img src={require("../../../res/img/feather-customised/warning-triangle.svg")} width="24" height="24" title="/!\ " alt="/!\ " />
                    <div>
                        <div className="mx_RoomStatusBar_connectionLostBar_title">
                            { _t('Connectivity to the server has been lost.') }
                        </div>
                        <div className="mx_RoomStatusBar_connectionLostBar_desc">
                            { _t('Sent messages will be stored until your connection has returned.') }
                        </div>
                    </div>
                </div>
            );
        }

        if (this.state.unsentMessages.length > 0) {
            return this._getUnsentMessageContent();
        }

        // If you're alone in the room, and have sent a message, suggest to invite someone
        if (this.props.sentMessageAndIsAlone && !this.props.isPeeking) {
            //this.props.room
            //{ _t("There's no one else here!") }

            let warningText = _t("There's no one else here!");
            const dmUserId = DMRoomMap.shared().getUserIdForRoomId(this.props.room.roomId);
            const accessRule = Tchap.getAccessRules(this.props.room.roomId)
            if (accessRule === "direct" && dmUserId) {
                const partner = MatrixClientPeg.get().getUser(dmUserId);
                warningText = _t("%(user)s seems to have left the conversation. Do you want to <btn>invite</btn> him back?", {
                    user: partner.rawDisplayName
                }, {
                    'btn': (sub)=><AccessibleButton
                        onClick={this._onReinviteClick}
                        kind={'primary_outline'}
                        className="tc_RoomStatusBar_reinvite"
                    >{ sub }</AccessibleButton>,
                })
            }

            return (
                <div className="mx_RoomStatusBar_isAlone">
                    { warningText }
                </div>
            );
        }

        return null;
    }

    render() {
        const content = this._getContent();

        return (
            <div className="mx_RoomStatusBar">
                <div role="alert">
                    { content }
                </div>
            </div>
        );
    }
}
