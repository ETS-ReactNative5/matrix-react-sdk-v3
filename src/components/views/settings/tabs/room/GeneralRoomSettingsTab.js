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
import {_t} from "../../../../../languageHandler";
import RoomProfileSettings from "../../../room_settings/RoomProfileSettings";
import RoomAccessSettings from "../../../room_settings/RoomAccessSettings";
import * as sdk from "../../../../..";
import AccessibleButton from "../../../elements/AccessibleButton";
import dis from "../../../../../dispatcher/dispatcher";
import MatrixClientContext from "../../../../../contexts/MatrixClientContext";
import SettingsStore from "../../../../../settings/SettingsStore";
import {UIFeature} from "../../../../../settings/UIFeature";
import Modal from '../../../../../Modal';
import Tchap from "../../../../../tchap/Tchap";

export default class GeneralRoomSettingsTab extends React.Component {
    static propTypes = {
        roomId: PropTypes.string.isRequired,
    };

    static contextType = MatrixClientContext;

    constructor() {
        super();
    }

    _onLeaveClick = () => {
        const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
        const client = this.context;
        const room = client.getRoom(this.props.roomId);

        if (Tchap.isUserLastAdmin(room)) {
            Modal.createTrackedDialog('Last admin leave', '', QuestionDialog, {
                title: _t("You are the last administrator"),
                description: _t("Are you sure you want to leave the room? The room will no longer be administered, and you may not be able to join it again."),
                button: _t("Leave"),
                onFinished: (proceed) => {
                    if (proceed) {
                        // Leave room
                        dis.dispatch({
                            action: 'leave_room',
                            room_id: this.props.roomId,
                        });
                    }
                },
            });
        } else {
            dis.dispatch({
                action: 'leave_room',
                room_id: this.props.roomId,
            });
        }
    };

    render() {
        return (
            <div className="mx_SettingsTab mx_GeneralRoomSettingsTab">
                <div className="mx_SettingsTab_heading">{_t("General")}</div>
                <div className='mx_SettingsTab_section mx_GeneralRoomSettingsTab_profileSection'>
                    <RoomProfileSettings roomId={this.props.roomId} />
                </div>
                <span className='mx_SettingsTab_subheading'>{_t("Leave room")}</span>
                <div className='mx_SettingsTab_section'>
                    <AccessibleButton kind='danger' onClick={this._onLeaveClick}>
                        { _t('Leave room') }
                    </AccessibleButton>
                </div>
            </div>
        );
    }
}
