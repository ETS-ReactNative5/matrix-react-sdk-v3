/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017 New Vector Ltd.
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
import Tchap from '../../Tchap'
import BaseDialog from "../../../components/views/dialogs/BaseDialog";
import DialogButtons from "../../../components/views/elements/DialogButtons";

export default class ExpiredAccountDialog extends React.Component {
	static propTypes = {
		button: PropTypes.string,
		focus: PropTypes.bool,
		newEmailRequested: PropTypes.bool.isRequired,
		onFinished: PropTypes.func.isRequired,
		onRequestNewEmail: PropTypes.func.isRequired,
	}

	constructor(props) {
		super(props);
		this.onResendEmail = this.onResendEmail.bind(this);
		this.state = {
			newEmailRequested: this.props.newEmailRequested,
		};
	}

	onOk = () => {
		this.props.onFinished(true);
	}

	onResendEmail() {
		this.setState({
			newEmailRequested: true,
		})
		this.props.onRequestNewEmail();
	}

	render() {
		let description = _t('The validity period of your account has expired. An email has been sent to you in ' +
			'order to renew it. Once you’ve followed the link it contains, click below.');
		if (this.state.newEmailRequested) {
			description = _t('An email has been sent to you. Once you’ve followed the link it contains, click below.');
		}

		return (
			<BaseDialog className="mx_QuestionDialog" onFinished={this.props.onFinished}
				title={ _t('The validity period of your account has expired') }
				contentId='mx_Dialog_content'
				hasCancel={false}
			>
				<div className="mx_Dialog_content" id='mx_Dialog_content'>
					<div>
						<p> { description }
						</p>
					</div>
				</div>
				<DialogButtons primaryButton={ _t('I renewed the validity of my account') }
					primaryButtonClass={null}
					cancelButton={null}
					hasCancel={false}
					onPrimaryButtonClick={this.onOk}
					focus={this.props.focus}
					onCancel={null}
				>
					<button onClick={this.onResendEmail}>
						{ _t('Request a renewal email') }
					</button>
				</DialogButtons>
			</BaseDialog>
		);
	}
}
