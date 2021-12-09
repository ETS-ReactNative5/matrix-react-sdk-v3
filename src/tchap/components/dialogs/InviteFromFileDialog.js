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

import React from 'react';
import PropTypes from 'prop-types';
import { _t } from '../../../languageHandler';
import * as sdk from '../../../index';
import {MatrixClientPeg} from '../../../MatrixClientPeg';
import Tchap from '../../Tchap';
import * as Email from "../../../email";

export default class InviteFromFileDialog extends React.Component {
    static propTypes = {
        title: PropTypes.string.isRequired,
        roomId: PropTypes.string,
        button: PropTypes.string,
        onFinished: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);
        this._handleFileRead = this._handleFileRead.bind(this);
        this._parseFile = this._parseFile.bind(this);

        this.state = {
            error: null,
            errorRestricted: false,
            list: [],
            listSize: 0,
            fileReader: new FileReader(),
            processingIndex: 0,
            fileType: null,
            type: "",
            authorizedTypeTxt: ['text/plain'],
            authorizedTypeCsv: ['text/csv', 'text/x-csv', 'application/vnd.ms-excel', 'application/csv', 'application/x-csv'],
            authorizedTypeString: ".txt, .csv"
        };
    }

    onCancel = () => {
        this.props.onFinished(false);
    }

    onInvite = () => {
        console.error("INVITED")
        //this.props.onFinished(true, this.state.list);
    }

    _handleFileRead() {
        const fileReader = this.state.fileReader;
        const fileType = this.state.fileType;
        const authorizedTypeTxt = this.state.authorizedTypeTxt;
        const authorizedTypeCsv = this.state.authorizedTypeCsv;
        const room = MatrixClientPeg.get().getRoom(this.props.roomId);
        const accessRules = Tchap.getAccessRules(this.props.roomId);

        let list = fileReader.result;
        let addresses = null;

        console.error("list")
        console.error(list)

        if (authorizedTypeTxt.includes(fileType)) {
            if (list.includes("<") && list.includes(">")) {
                this.setState({type: "Outlook"});
                let tmpAddresses = null;
                list = list.replace(/(\r\n|\n|\r)/gm, "");
                list = list.replaceAll("<", " ");
                list = list.replaceAll(">", " ");
                list = list.replaceAll(";", " ");
                tmpAddresses = list.split(" ").filter(Boolean);
                addresses = tmpAddresses.filter(a => Email.looksValid(a));
            } else {
                this.setState({type: "Txt"});
                list = list.replace(/(\r\n|\n|\r)/gm, "");
                list = list.replace(/\s/gm, "");
                addresses = list.split(";").filter(Boolean);
            }
        } else if (authorizedTypeCsv.includes(fileType)) {
            this.setState({type: "Csv"});
            list = list.replace(/(\r)/gm, "");
            list = list.replace(/(\r\n|\n)/gm, ";");
            list = list.replace(/\s/gm, "");
            addresses = list.split(";").filter(Boolean);
        } else {
            return;
        }

        console.error("addresses");
        console.error(addresses);

        this.setState({
            listSize: addresses.length
        });

        for (let address of addresses) {
            if (address) {
                if (Email.looksValid(address)) {
                    if (accessRules === "restricted") {
                        Tchap.getHSInfoFromEmail(address).then(res => {
                            if (!Tchap.isUserExternFromServerHostname(res.hs)) {
                                Tchap.lookupThreePid("email", address).then(r => {
                                    const member = room.getMember(r.mxid);
                                    const invitedUser = r.mxid ? r.mxid : address;
                                    let idx = this.state.processingIndex + 1;
                                    if (member === null || !member.membership || member.membership === "leave") {
                                        let tmpList = this.state.list;
                                        tmpList.push(invitedUser);
                                        this.setState({
                                            list: tmpList
                                        });
                                    }
                                    this.setState({
                                        processingIndex: idx
                                    });
                                });
                            } else {
                                let idx = this.state.processingIndex + 1;
                                this.setState({
                                    errorRestricted: true,
                                    processingIndex: idx
                                });
                            }
                        });
                    } else {
                        Tchap.lookupThreePid("email", address).then(r => {
                            const member = room.getMember(r.mxid);
                            const invitedUser = r.mxid ? r.mxid : address;
                            let idx = this.state.processingIndex + 1;
                            if (member === null || !member.membership || member.membership === "leave") {
                                let tmpList = this.state.list;
                                tmpList.push(invitedUser);
                                this.setState({
                                    list: tmpList
                                });
                            }
                            this.setState({
                                processingIndex: idx
                            });
                        });
                    }
                } else {
                    let idx = this.state.processingIndex + 1;
                    this.setState({
                        error: <div className="mx_AddressPickerDialog_error">{ _t("This file contains at least one invalid email address : %(address)s.", {address}) }</div>,
                        list: [],
                        processingIndex: idx
                    });
                    return;
                }
            }
        }
    }

    _parseFile(file) {
        const authorizedType = (this.state.authorizedTypeTxt).concat(this.state.authorizedTypeCsv);
        this.setState({
            error: null,
            errorRestricted: false,
            list: [],
            processingIndex: 0,
            fileType: null
        });
        if (!authorizedType.includes(file.type)) {
            this.setState({
                error: <div className="mx_AddressPickerDialog_error">{ _t("Error : Invalid file format.") }</div>
            });
        } else if (file.size > 25000) {
            this.setState({
                error: <div className="mx_AddressPickerDialog_error">{ _t("Error : File too large (max 25 kB).") }</div>
            });
        } else {
            const fileReader = this.state.fileReader;
            this.setState({ fileType: file.type})
            fileReader.onloadend = this._handleFileRead;
            fileReader.readAsText(file);
        }
    }

    render() {
        const BaseDialog = sdk.getComponent('views.dialogs.BaseDialog');
        const DialogButtons = sdk.getComponent('views.elements.DialogButtons');

        let roomParams = null;
        if (this.props.roomId) {
            const ar = Tchap.getAccessRules(this.props.roomId) !== "unrestricted"
                ? _t("Externals aren't allowed to join this room")
                : _t("Externals are allowed to join this room");
            roomParams = (<label>{ar}</label>);
        }

        const inviteNumber = this.state.list ? this.state.list.length : 0;
        const error = this.state.error;
        const totalProcess = this.state.processingIndex;
        const totalSize = this.state.listSize;
        const type = this.state.type;
        const authorizedType = this.state.authorizedTypeString;

        let errorRestricted = null;
        if (this.state.errorRestricted && !error) {
            errorRestricted = (
                <div className="mx_AddressPickerDialog_warning">
                    { _t("Some users are extern. This room is restricted. They will not be invited.") }
                </div>
            );
        }

        return (
            <BaseDialog className="mx_AddressPickerDialog"
                onFinished={this.props.onFinished}
                title={this.props.title}>
                <div className="mx_AddressPickerDialog_label">
                    <label htmlFor="import-file">
                        { _t("Supported formats :") }
                        <ul>
                            <li>{_t(".txt with email addresses separated by \" ; \"")}</li>
                            <li>{_t(".txt with outlook format email (i.e. \"Firstname Name <firstname.name@email.com>;\")")}</li>
                            <li>{_t(".csv with email addresses separated by lines break")}</li>
                        </ul>
                    </label>
                    <br />
                    { roomParams }
                </div>
                <div className="mx_Dialog_content">
                    { error }
                    { errorRestricted }
                    <br />
                    <input type="file"
                        id="import-file"
                        accept={authorizedType}
                        onChange={e => this._parseFile(e.target.files[0])}
                    />
                    <span className="tc_InviteDialog_InviteFromFile_type">Type : {type}</span>
                </div>
                <DialogButtons primaryButton={_t("Send %(number)s invites", {number: inviteNumber})}
                    onPrimaryButtonClick={this.onInvite}
                    primaryDisabled={!!error || totalProcess === 0 || totalProcess !== totalSize}
                    onCancel={this.onCancel}
                />
            </BaseDialog>
        );
    }
}
