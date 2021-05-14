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
import {_t} from "../../../../languageHandler";
import RoomAccessSettings from "../../../../components/views/room_settings/RoomAccessSettings";
import * as sdk from "../../../..";
import AccessibleButton from "../../../../components/views/elements/AccessibleButton";
import MatrixClientContext from "../../../../contexts/MatrixClientContext";
import Modal from '../../../../Modal';

export default class AccessRoomSettingsTab extends React.Component {
    static propTypes = {
        roomId: PropTypes.string.isRequired,
    };

    static contextType = MatrixClientContext;

    constructor() {
        super();

        this.state = {
            isRoomPublished: false, // loaded async
        };
    }

    componentDidMount() {
        this.context.getRoomDirectoryVisibility(this.props.roomId).then((result => {
            this.setState({isRoomPublished: result.visibility === 'public'});
        }));
    }

    _onRoomPublishChange = () => {
        const client = this.context;
        const room = client.getRoom(this.props.roomId);
        const self = this;
        const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");

        Modal.createTrackedDialog('Remove this room from the forums directory', '', QuestionDialog, {
            title: _t('Remove this room from the forums directory'),
            description: ( _t('This action is irreversible.') + " " + _t('Are you sure you want to remove this room from the forums directory?')),
            onFinished: (confirm) => {
                if (confirm) {
                    client.sendStateEvent(room.roomId, "m.room.encryption", { algorithm: "m.megolm.v1.aes-sha2" });
                    client.sendStateEvent(room.roomId, "m.room.join_rules", {join_rule: "invite"}, "");
                    client.sendStateEvent(room.roomId, "m.room.history_visibility", {history_visibility: "invited"}, "");
                    client.setRoomDirectoryVisibility(room.roomId, 'private').catch(() => {
                        // Roll back the local echo on the change
                        this.setState({isRoomPublished: true});
                    });
                    self.setState({isRoomPublished: false});
                }
            },
        });
    };

    render() {
        const client = this.context;
        const room = client.getRoom(this.props.roomId);
        const isCurrentUserAdmin = room.getMember(client.getUserId()).powerLevelNorm >= 100;

        let roomPublishChange = null;
        if (isCurrentUserAdmin && this.state.isRoomPublished) {
            roomPublishChange = (
                <div>
                    <span className='mx_SettingsTab_subheading'>{_t('Remove this room from the forums directory')}</span>
                    <div className='mx_SettingsTab_section'>
                        <AccessibleButton kind='primary' onClick={this._onRoomPublishChange}>
                            {_t('Remove this room from the forums directory')}
                        </AccessibleButton>
                    </div>
                </div>
            );
        }

        return (
            <div className="mx_SettingsTab mx_GeneralRoomSettingsTab">
                <div className="mx_SettingsTab_heading">{_t("Type & Access")}</div>
                <div className="mx_SettingsTab_heading">{_t("Access")}</div>
                <div className='mx_SettingsTab_section mx_GeneralRoomSettingsTab_profileSection'>
                    <RoomAccessSettings roomId={this.props.roomId} />
                    { roomPublishChange }
                </div>
            </div>
        );
    }
}
