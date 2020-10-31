/*
Copyright 2017 OpenMarket Ltd
Copyright 2018 New Vector Ltd
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>
Copyright 2019 The Matrix.org Foundation C.I.C.

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
import * as sdk from '../../../index';
import SdkConfig from '../../../SdkConfig';
import Modal from '../../../Modal';
import { _t } from '../../../languageHandler';
import sendBugReport, {downloadBugReport} from '../../../rageshake/submit-rageshake';
import AccessibleButton from "../elements/AccessibleButton";
import {MatrixClientPeg} from "../../../MatrixClientPeg";

export default class BugReportDialog extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            sendLogs: true,
            busy: false,
            err: null,
            issueUrl: "",
            text: "",
            progress: null,
            downloadBusy: false,
            downloadProgress: null,
        };
        this._unmounted = false;
        this._onSubmit = this._onSubmit.bind(this);
        this._onCancel = this._onCancel.bind(this);
        this._onTextChange = this._onTextChange.bind(this);
        this._onSendLogsChange = this._onSendLogsChange.bind(this);
        this._sendProgressCallback = this._sendProgressCallback.bind(this);
        this._downloadProgressCallback = this._downloadProgressCallback.bind(this);
    }

    componentWillUnmount() {
        this._unmounted = true;
    }

    _onCancel(ev) {
        this.props.onFinished(false);
    }

    _onSubmit(ev) {
        let userText;
        if (this.state.text.length > 0) {
            userText = this.state.text + '\n\n';
        } else {
            if (!this._unmounted) {
                this.setState({
                    busy: false,
                    progress: null,
                    err: _t("The field note is required."),
                });
            }
            return;
        }

        const bugReportEndpointUrl = MatrixClientPeg.get().baseUrl + SdkConfig.get().bug_report_endpoint_url;
        this.setState({ busy: true, progress: null, err: null });
        this._sendProgressCallback(_t("Preparing to send logs"));

        sendBugReport(bugReportEndpointUrl, {
            userText,
            sendLogs: true,
            progressCallback: this._sendProgressCallback,
            label: this.props.label,
        }).then(() => {
            if (!this._unmounted) {
                this.props.onFinished(false);
                const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
                // N.B. first param is passed to piwik and so doesn't want i18n
                Modal.createTrackedDialog('Bug report sent', '', QuestionDialog, {
                    title: _t('Logs sent'),
                    description: _t('Thank you!'),
                    hasCancelButton: false,
                });
            }
        }, (err) => {
            if (!this._unmounted) {
                this.setState({
                    busy: false,
                    progress: null,
                    err: _t("Failed to send logs: ") + `${err.message}`,
                });
            }
        });
    }

    _onDownload = async (ev) => {
        this.setState({ downloadBusy: true });
        this._downloadProgressCallback(_t("Preparing to download logs"));

        try {
            await downloadBugReport({
                sendLogs: true,
                progressCallback: this._downloadProgressCallback,
                label: this.props.label,
            });

            this.setState({
                downloadBusy: false,
                downloadProgress: null,
            });
        } catch (err) {
            if (!this._unmounted) {
                this.setState({
                    downloadBusy: false,
                    downloadProgress: _t("Failed to send logs: ") + `${err.message}`,
                });
            }
        }
    };

    _onTextChange(ev) {
        this.setState({ text: ev.target.value });
    }

    _onSendLogsChange(ev) {
        this.setState({ sendLogs: ev.target.checked });
    }

    _sendProgressCallback(progress) {
        if (this._unmounted) {
            return;
        }
        this.setState({progress: progress});
    }

    _downloadProgressCallback(downloadProgress) {
        if (this._unmounted) {
            return;
        }
        this.setState({ downloadProgress });
    }

    render() {
        const Loader = sdk.getComponent("elements.Spinner");
        const BaseDialog = sdk.getComponent('views.dialogs.BaseDialog');
        const DialogButtons = sdk.getComponent('views.elements.DialogButtons');
        const Field = sdk.getComponent('elements.Field');

        let error = null;
        if (this.state.err) {
            error = <div className="error">
                {this.state.err}
            </div>;
        }

        let progress = null;
        if (this.state.busy) {
            progress = (
                <div className="progress">
                    <Loader />
                    {this.state.progress} ...
                </div>
            );
        }

        let warning;
        if (window.Modernizr && Object.values(window.Modernizr).some(support => support === false)) {
            warning = <p><b>
                { _t("Reminder: Your browser is unsupported, so your experience may be unpredictable.") }
            </b></p>;
        }

        return (
            <BaseDialog className="mx_BugReportDialog" onFinished={this._onCancel}
                    title={_t('Report an error')}
                contentId='mx_Dialog_content'
            >
                <div className="mx_Dialog_content" id='mx_Dialog_content'>
                    { warning }
                    <p>
                        { _t("Describe your problem here.") }
                    </p>
                    <p><b>
                        { _t(
                            "In order to diagnose problems, logs from this client will " +
                            "be sent with this error report. This error report, including " +
                            "logs, will not be visible publicly."
                        ) }
                    </b></p>

                    <div className="mx_BugReportDialog_download">
                        <AccessibleButton onClick={this._onDownload} kind="link" disabled={this.state.downloadBusy}>
                            { _t("Download logs") }
                        </AccessibleButton>
                        {this.state.downloadProgress && <span>{this.state.downloadProgress} ...</span>}
                    </div>
                    <Field
                        className="mx_BugReportDialog_field_input"
                        element="textarea"
                        label={_t("Notes")}
                        rows={5}
                        onChange={this._onTextChange}
                        value={this.state.text}
                        placeholder={_t(
                            "Please describe the error encountered. What have you done ? " +
                            "What was the expected behavior ? What really happened ?"
                        )}
                    />
                    {progress}
                    {error}
                </div>
                <DialogButtons primaryButton={_t("Send logs")}
                    onPrimaryButtonClick={this._onSubmit}
                    focus={true}
                    onCancel={this._onCancel}
                    disabled={this.state.busy}
                />
            </BaseDialog>
        );
    }
}

BugReportDialog.propTypes = {
    onFinished: PropTypes.func.isRequired,
    initialText: PropTypes.string,
};
