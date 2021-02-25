/*
Copyright 2015, 2016, 2017, 2018, 2019 The Matrix.org Foundation C.I.C.

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

import React, {ReactNode} from 'react';
import {MatrixError} from "matrix-js-sdk/src/http-api";

import {_t, _td} from '../../../languageHandler';
import * as sdk from '../../../index';
import Login, {ISSOFlow, LoginFlow} from '../../../Login';
import SdkConfig from '../../../SdkConfig';
import { messageForResourceLimitError } from '../../../utils/ErrorUtils';
import AutoDiscoveryUtils, {ValidatedServerConfig} from "../../../utils/AutoDiscoveryUtils";
import classNames from "classnames";
import AuthPage from "../../views/auth/AuthPage";
import PlatformPeg from '../../../PlatformPeg';
import SettingsStore from "../../../settings/SettingsStore";
import {UIFeature} from "../../../settings/UIFeature";
import CountlyAnalytics from "../../../CountlyAnalytics";
import {IMatrixClientCreds} from "../../../MatrixClientPeg";
import PasswordLogin from "../../views/auth/PasswordLogin";
import InlineSpinner from "../../views/elements/InlineSpinner";
import Spinner from "../../views/elements/Spinner";
import SSOButtons from "../../views/elements/SSOButtons";
import ServerPicker from "../../views/elements/ServerPicker";
import Tchap from "../../../tchap/Tchap";

// These are used in several places, and come from the js-sdk's autodiscovery
// stuff. We define them here so that they'll be picked up by i18n.
_td("Invalid homeserver discovery response");
_td("Failed to get autodiscovery configuration from server");
_td("Invalid base_url for m.homeserver");
_td("Homeserver URL does not appear to be a valid Matrix homeserver");
_td("Invalid identity server discovery response");
_td("Invalid base_url for m.identity_server");
_td("Identity server URL does not appear to be a valid identity server");
_td("General failure");

interface IProps {
    serverConfig: ValidatedServerConfig;
    // If true, the component will consider itself busy.
    busy?: boolean;
    isSyncing?: boolean;
    // Secondary HS which we try to log into if the user is using
    // the default HS but login fails. Useful for migrating to a
    // different homeserver without confusing users.
    fallbackHsUrl?: string;
    defaultDeviceDisplayName?: string;
    fragmentAfterLogin?: string;

    // Called when the user has logged in. Params:
    // - The object returned by the login API
    // - The user's password, if applicable, (may be cached in memory for a
    //   short time so the user is not required to re-enter their password
    //   for operations like uploading cross-signing keys).
    onLoggedIn(data: IMatrixClientCreds, password: string): void;

    // login shouldn't know or care how registration, password recovery, etc is done.
    onRegisterClick(): void;
    onForgotPasswordClick?(): void;
}

interface IState {
    busy: boolean;
    busyLoggingIn?: boolean;
    errorText?: ReactNode;
    loginIncorrect: boolean;
    // can we attempt to log in or are there validation errors?
    canTryLogin: boolean;

    flows?: LoginFlow[];

    // used for preserving form values when changing homeserver
    username: string;

    // We perform liveliness checks later, but for now suppress the errors.
    // We also track the server dead errors independently of the regular errors so
    // that we can render it differently, and override any other error the user may
    // be seeing.
    serverIsAlive: boolean;
    serverErrorIsFatal: boolean;
    serverDeadError: string;
}

/*
 * A wire component which glues together login UI components and Login logic
 */
export default class LoginComponent extends React.PureComponent<IProps, IState> {
    private unmounted = false;
    private loginLogic: Login;

    private readonly stepRendererMap: Record<string, () => ReactNode>;

    constructor(props) {
        super(props);

        this.state = {
            busy: false,
            busyLoggingIn: null,
            errorText: null,
            loginIncorrect: false,
            canTryLogin: true,

            flows: null,

            username: "",

            serverIsAlive: true,
            serverErrorIsFatal: false,
            serverDeadError: "",
        };

        // map from login step type to a function which will render a control
        // letting you do that login type
        this.stepRendererMap = {
            'm.login.password': this.renderPasswordStep,
        };
        CountlyAnalytics.instance.track("onboarding_login_begin");
    }

    componentDidMount() {
        const randomHS = Tchap.getRandomHSUrlFromList();
        this.initLoginLogic(randomHS, randomHS);
    }

    componentWillUnmount() {
        this.unmounted = true;
    }

    isBusy = () => this.state.busy || this.props.busy;

    onPasswordLogin = async (username, phoneCountry, phoneNumber, password) => {
        this.setState({
            busy: true,
            busyLoggingIn: true,
            errorText: null,
            loginIncorrect: false,
        });

        await Tchap.discoverPlatform(username).then(hs => {
            this.initLoginLogic(hs, hs);
        }).then(() => {
            this.loginLogic.loginViaPassword(
                username, phoneCountry, phoneNumber, password,
            ).then((data) => {
                this.setState({serverIsAlive: true}); // it must be, we logged in.
                this.props.onLoggedIn(data, password);
            }, (error) => {
                if (this.unmounted) {
                    return;
                }
                let errorText;

                if (error.httpStatus === 401 || error.httpStatus === 403) {
                    if (error.errcode === 'M_USER_DEACTIVATED') {
                        errorText = _t('This account has been deactivated.');
                    } else {
                        errorText = _t('Incorrect username and/or password.');
                    }
                } else {
                    // other errors, not specific to doing a password login
                    errorText = this.errorTextFromError(error);
                }

                this.setState({
                    busy: false,
                    busyLoggingIn: false,
                    errorText: errorText,
                    // 401 would be the sensible status code for 'incorrect password'
                    // but the login API gives a 403 https://matrix.org/jira/browse/SYN-744
                    // mentions this (although the bug is for UI auth which is not this)
                    // We treat both as an incorrect password
                    loginIncorrect: error.httpStatus === 401 || error.httpStatus === 403,
                });
            });
        });
    };

    onUsernameChanged = username => {
        this.setState({ username: username });
    };

    onUsernameBlur = async username => {
        this.setState({
            username: username,
            errorText: null,
            canTryLogin: true,
        });
    };

    onRegisterClick = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this.props.onRegisterClick();
    };

    onTryRegisterClick = ev => {
        this.onRegisterClick(ev);
    };

    private async initLoginLogic(hsUrl, isUrl) {
        const loginLogic = new Login(hsUrl, isUrl, null, {
            defaultDeviceDisplayName: this.props.defaultDeviceDisplayName,
        });
        this.loginLogic = loginLogic;

        this.setState({
            busy: true,
            loginIncorrect: false,
        });

        loginLogic.getFlows().then((flows) => {
            // look for a flow where we understand all of the steps.
            const supportedFlows = flows.filter(this.isSupportedFlow);

            if (supportedFlows.length > 0) {
                this.setState({
                    flows: supportedFlows,
                });
                return;
            }

            // we got to the end of the list without finding a suitable flow.
            this.setState({
                errorText: _t("This homeserver doesn't offer any login flows which are supported by this client."),
            });
        }, (err) => {
            this.setState({
                errorText: this.errorTextFromError(err),
                loginIncorrect: false,
                canTryLogin: false,
            });
        }).finally(() => {
            this.setState({
                busy: false,
            });
        });
    }

    private isSupportedFlow = (flow: LoginFlow): boolean => {
        // technically the flow can have multiple steps, but no one does this
        // for login and loginLogic doesn't support it so we can ignore it.
        if (!this.stepRendererMap[flow.type]) {
            console.log("Skipping flow", flow, "due to unsupported login type", flow.type);
            return false;
        }
        return true;
    };

    private errorTextFromError(err: MatrixError): ReactNode {
        let errCode = err.errcode;
        if (!errCode && err.httpStatus) {
            errCode = "HTTP " + err.httpStatus;
        }

        let errorText = "";
        if (errCode === 'M_LIMIT_EXCEEDED') {
            errorText = "Your last three login attempts have failed. Please try again in 30 minutes.";
        } else {
            errorText = _t("Error: Problem communicating with the given homeserver.") +
                (errCode ? " (" + errCode + ")" : "");
        }

        if (err.cors === 'rejected') {
            errorText = _t("Homeserver unreachable.");
        }

        return errorText;
    }

    renderLoginComponentForFlows() {
        if (!this.state.flows) return null;

        // this is the ideal order we want to show the flows in
        const order = [
            "m.login.password",
            "m.login.sso",
        ];

        const flows = order.map(type => this.state.flows.find(flow => flow.type === type)).filter(Boolean);
        return <React.Fragment>
            { flows.map(flow => {
                const stepRenderer = this.stepRendererMap[flow.type];
                return <React.Fragment key={flow.type}>{ stepRenderer() }</React.Fragment>
            }) }
        </React.Fragment>
    }

    private renderPasswordStep = () => {
        return (
            <PasswordLogin
                onSubmit={this.onPasswordLogin}
                username={this.state.username}
                onUsernameChanged={this.onUsernameChanged}
                onUsernameBlur={this.onUsernameBlur}
                onForgotPasswordClick={this.props.onForgotPasswordClick}
                loginIncorrect={this.state.loginIncorrect}
                serverConfig={null}
                disableSubmit={this.isBusy()}
                busy={this.props.isSyncing || this.state.busyLoggingIn}
            />
        );
    };

    private renderSsoStep = loginType => {
        const flow = this.state.flows.find(flow => flow.type === "m.login." + loginType) as ISSOFlow;

        return (
            <SSOButtons
                matrixClient={this.loginLogic.createTemporaryClient()}
                flow={flow}
                loginType={loginType}
                fragmentAfterLogin={this.props.fragmentAfterLogin}
                primary={!this.state.flows.find(flow => flow.type === "m.login.password")}
            />
        );
    };

    render() {
        const AuthHeader = sdk.getComponent("auth.AuthHeader");
        const AuthBody = sdk.getComponent("auth.AuthBody");
        const loader = this.isBusy() && !this.state.busyLoggingIn ?
            <div className="mx_Login_loader"><Spinner /></div> : null;

        const errorText = this.state.errorText;

        let errorTextSection;
        if (errorText) {
            errorTextSection = (
                <div className="mx_Login_error">
                    { errorText }
                </div>
            );
        }

        let serverDeadSection;
        if (!this.state.serverIsAlive) {
            const classes = classNames({
                "mx_Login_error": true,
                "mx_Login_serverError": true,
                "mx_Login_serverErrorNonFatal": !this.state.serverErrorIsFatal,
            });
            serverDeadSection = (
                <div className={classes}>
                    {this.state.serverDeadError}
                </div>
            );
        }

        let footer;
        if (this.props.isSyncing || this.state.busyLoggingIn) {
            footer = <div className="mx_AuthBody_paddedFooter">
                <div className="mx_AuthBody_paddedFooter_title">
                    <InlineSpinner w={20} h={20} />
                    { this.props.isSyncing ? _t("Syncing...") : _t("Signing In...") }
                </div>
                { this.props.isSyncing && <div className="mx_AuthBody_paddedFooter_subtitle">
                    {_t("If you've joined lots of rooms, this might take a while")}
                </div> }
            </div>;
        } else {
            footer = (
                <span className="mx_AuthBody_changeFlow">
                    {_t("New? <a>Create account</a>", {}, {
                        a: sub => <a onClick={this.onTryRegisterClick} href="#">{ sub }</a>,
                    })}
                </span>
            );
        }

        return (
            <AuthPage>
                <AuthHeader disableLanguageSelector={this.props.isSyncing || this.state.busyLoggingIn} />
                <AuthBody>
                    <h2>
                        {_t('Sign in')}
                        {loader}
                    </h2>
                    { errorTextSection }
                    { serverDeadSection }
                    { this.renderLoginComponentForFlows() }
                    { footer }
                </AuthBody>
            </AuthPage>
        );
    }
}
