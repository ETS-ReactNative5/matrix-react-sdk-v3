/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017, 2018 New Vector Ltd
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
import React, {createRef} from 'react';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import { _t } from '../../../languageHandler';
import CallHandler from '../../../CallHandler';
import {MatrixClientPeg} from '../../../MatrixClientPeg';
import * as sdk from '../../../index';
import dis from '../../../dispatcher/dispatcher';
import Stickerpicker from './Stickerpicker';
import { makeRoomPermalink } from '../../../utils/permalinks/Permalinks';
import ContentMessages from '../../../ContentMessages';
import E2EIcon from './E2EIcon';
import SettingsStore from "../../../settings/SettingsStore";
import {aboveLeftOf, ContextMenu, ContextMenuTooltipButton, useContextMenu} from "../../structures/ContextMenu";
import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";
import ReplyPreview from "./ReplyPreview";
import {UIFeature} from "../../../settings/UIFeature";
import WidgetStore from "../../../stores/WidgetStore";
import WidgetUtils from "../../../utils/WidgetUtils";
import {UPDATE_EVENT} from "../../../stores/AsyncStore";
import ActiveWidgetStore from "../../../stores/ActiveWidgetStore";
import { PlaceCallType } from "../../../CallHandler";
import { CallState } from 'matrix-js-sdk/src/webrtc/call';

function ComposerAvatar(props) {
    const MemberStatusMessageAvatar = sdk.getComponent('avatars.MemberStatusMessageAvatar');
    return <div className="mx_MessageComposer_avatar">
        <MemberStatusMessageAvatar member={props.me} width={24} height={24} />
    </div>;
}

ComposerAvatar.propTypes = {
    me: PropTypes.object.isRequired,
};

function CallButton(props) {
    const onVoiceCallClick = (ev) => {
        dis.dispatch({
            action: 'place_call',
            type: PlaceCallType.Voice,
            room_id: props.roomId,
        });
    };

    return (<AccessibleTooltipButton
        className="mx_MessageComposer_button mx_MessageComposer_voicecall"
        onClick={onVoiceCallClick}
        title={_t('Voice call')}
    />);
}

CallButton.propTypes = {
    roomId: PropTypes.string.isRequired,
};

function VideoCallButton(props) {
    const onCallClick = (ev) => {
        dis.dispatch({
            action: 'place_call',
            type: ev.shiftKey ? PlaceCallType.ScreenSharing : PlaceCallType.Video,
            room_id: props.roomId,
        });
    };

    return <AccessibleTooltipButton
        className="mx_MessageComposer_button mx_MessageComposer_videocall"
        onClick={onCallClick}
        title={_t('Video call')}
    />;
}

VideoCallButton.propTypes = {
    roomId: PropTypes.string.isRequired,
};

function HangupButton(props) {
    const onHangupClick = () => {
        if (props.isConference) {
            dis.dispatch({
                action: props.canEndConference ? 'end_conference' : 'hangup_conference',
                room_id: props.roomId,
            });
            return;
        }

        const call = CallHandler.sharedInstance().getCallForRoom(props.roomId);
        if (!call) {
            return;
        }

        const action = call.state === CallState.Ringing ? 'reject' : 'hangup';

        dis.dispatch({
            action,
            // hangup the call for this room. NB. We use the room in props as the room ID
            // as call.roomId may be the 'virtual room', and the dispatch actions always
            // use the user-facing room (there was a time when we deliberately used
            // call.roomId and *not* props.roomId, but that was for the old
            // style Freeswitch conference calls and those times are gone.)
            room_id: props.roomId,
        });
    };

    let tooltip = _t("Hangup");
    if (props.isConference && props.canEndConference) {
        tooltip = _t("End conference");
    }

    const canLeaveConference = !props.isConference ? true : props.isInConference;
    return (
        <AccessibleTooltipButton
            className="mx_MessageComposer_button mx_MessageComposer_hangup"
            onClick={onHangupClick}
            title={tooltip}
            disabled={!canLeaveConference}
        />
    );
}

HangupButton.propTypes = {
    roomId: PropTypes.string.isRequired,
    isConference: PropTypes.bool.isRequired,
    canEndConference: PropTypes.bool,
    isInConference: PropTypes.bool,
};

const EmojiButton = ({addEmoji}) => {
    const [menuDisplayed, button, openMenu, closeMenu] = useContextMenu();

    let contextMenu;
    if (menuDisplayed) {
        const buttonRect = button.current.getBoundingClientRect();
        const EmojiPicker = sdk.getComponent('emojipicker.EmojiPicker');
        contextMenu = <ContextMenu {...aboveLeftOf(buttonRect)} onFinished={closeMenu} catchTab={false}>
            <EmojiPicker onChoose={addEmoji} showQuickReactions={true} />
        </ContextMenu>;
    }

    const className = classNames(
        "mx_MessageComposer_button",
        "mx_MessageComposer_emoji",
        {
            "mx_MessageComposer_button_highlight": menuDisplayed,
        },
    );

    // TODO: replace ContextMenuTooltipButton with a unified representation of
    // the header buttons and the right panel buttons
    return <React.Fragment>
        <ContextMenuTooltipButton
            className={className}
            onClick={openMenu}
            isExpanded={menuDisplayed}
            title={_t('Emoji picker')}
            inputRef={button}
        >

        </ContextMenuTooltipButton>

        { contextMenu }
    </React.Fragment>;
};

class UploadButton extends React.Component {
    static propTypes = {
        roomId: PropTypes.string.isRequired,
    }

    constructor(props) {
        super(props);
        this.onUploadClick = this.onUploadClick.bind(this);
        this.onUploadFileInputChange = this.onUploadFileInputChange.bind(this);

        this._uploadInput = createRef();
        this._dispatcherRef = dis.register(this.onAction);
    }

    componentWillUnmount() {
        dis.unregister(this._dispatcherRef);
    }

    onAction = payload => {
        if (payload.action === "upload_file") {
            this.onUploadClick();
        }
    };

    onUploadClick(ev) {
        if (MatrixClientPeg.get().isGuest()) {
            dis.dispatch({action: 'require_registration'});
            return;
        }
        this._uploadInput.current.click();
    }

    onUploadFileInputChange(ev) {
        if (ev.target.files.length === 0) return;

        // take a copy so we can safely reset the value of the form control
        // (Note it is a FileList: we can't use slice or sensible iteration).
        const tfiles = [];
        for (let i = 0; i < ev.target.files.length; ++i) {
            tfiles.push(ev.target.files[i]);
        }

        ContentMessages.sharedInstance().sendContentListToRoom(
            tfiles, this.props.roomId, MatrixClientPeg.get(),
        );

        // This is the onChange handler for a file form control, but we're
        // not keeping any state, so reset the value of the form control
        // to empty.
        // NB. we need to set 'value': the 'files' property is immutable.
        ev.target.value = '';
    }

    render() {
        const uploadInputStyle = {display: 'none'};
        return (
            <AccessibleTooltipButton
                className="mx_MessageComposer_button mx_MessageComposer_upload"
                onClick={this.onUploadClick}
                title={_t('Upload file')}
            >
                <input
                    ref={this._uploadInput}
                    type="file"
                    style={uploadInputStyle}
                    multiple
                    onChange={this.onUploadFileInputChange}
                />
            </AccessibleTooltipButton>
        );
    }
}

export default class MessageComposer extends React.Component {
    constructor(props) {
        super(props);
        this.onInputStateChanged = this.onInputStateChanged.bind(this);
        this._onRoomStateEvents = this._onRoomStateEvents.bind(this);
        this._onTombstoneClick = this._onTombstoneClick.bind(this);
        this.renderPlaceholderText = this.renderPlaceholderText.bind(this);
        WidgetStore.instance.on(UPDATE_EVENT, this._onWidgetUpdate);
        ActiveWidgetStore.on('update', this._onActiveWidgetUpdate);
        this._dispatcherRef = null;

        this.state = {
            tombstone: this._getRoomTombstone(),
            canSendMessages: this.props.room.maySendMessage(),
            showCallButtons: SettingsStore.getValue("showCallButtonsInComposer"),
            hasConference: WidgetStore.instance.doesRoomHaveConference(this.props.room),
            joinedConference: WidgetStore.instance.isJoinedToConferenceIn(this.props.room),
        };
    }

    onAction = (payload) => {
        if (payload.action === 'reply_to_event') {
            // add a timeout for the reply preview to be rendered, so
            // that the ScrollPanel listening to the resizeNotifier can
            // correctly measure it's new height and scroll down to keep
            // at the bottom if it already is
            setTimeout(() => {
                this.props.resizeNotifier.notifyTimelineHeightChanged();
            }, 100);
        }
    };

    _onWidgetUpdate = () => {
        this.setState({hasConference: WidgetStore.instance.doesRoomHaveConference(this.props.room)});
    };

    _onActiveWidgetUpdate = () => {
        this.setState({joinedConference: WidgetStore.instance.isJoinedToConferenceIn(this.props.room)});
    };

    componentDidMount() {
        this.dispatcherRef = dis.register(this.onAction);
        MatrixClientPeg.get().on("RoomState.events", this._onRoomStateEvents);
        this._waitForOwnMember();
    }

    _waitForOwnMember() {
        // if we have the member already, do that
        const me = this.props.room.getMember(MatrixClientPeg.get().getUserId());
        if (me) {
            this.setState({me});
            return;
        }
        // Otherwise, wait for member loading to finish and then update the member for the avatar.
        // The members should already be loading, and loadMembersIfNeeded
        // will return the promise for the existing operation
        this.props.room.loadMembersIfNeeded().then(() => {
            const me = this.props.room.getMember(MatrixClientPeg.get().getUserId());
            this.setState({me});
        });
    }

    componentWillUnmount() {
        if (MatrixClientPeg.get()) {
            MatrixClientPeg.get().removeListener("RoomState.events", this._onRoomStateEvents);
        }
        WidgetStore.instance.removeListener(UPDATE_EVENT, this._onWidgetUpdate);
        ActiveWidgetStore.removeListener('update', this._onActiveWidgetUpdate);
        dis.unregister(this.dispatcherRef);
    }

    _onRoomStateEvents(ev, state) {
        if (ev.getRoomId() !== this.props.room.roomId) return;

        if (ev.getType() === 'm.room.tombstone') {
            this.setState({tombstone: this._getRoomTombstone()});
        }
        if (ev.getType() === 'm.room.power_levels') {
            this.setState({canSendMessages: this.props.room.maySendMessage()});
        }
    }

    _getRoomTombstone() {
        return this.props.room.currentState.getStateEvents('m.room.tombstone', '');
    }

    onInputStateChanged(inputState) {
        // Merge the new input state with old to support partial updates
        inputState = Object.assign({}, this.state.inputState, inputState);
        this.setState({inputState});
    }

    _onTombstoneClick(ev) {
        ev.preventDefault();

        const replacementRoomId = this.state.tombstone.getContent()['replacement_room'];
        const replacementRoom = MatrixClientPeg.get().getRoom(replacementRoomId);
        let createEventId = null;
        if (replacementRoom) {
            const createEvent = replacementRoom.currentState.getStateEvents('m.room.create', '');
            if (createEvent && createEvent.getId()) createEventId = createEvent.getId();
        }

        const viaServers = [this.state.tombstone.getSender().split(':').splice(1).join(':')];
        dis.dispatch({
            action: 'view_room',
            highlighted: true,
            event_id: createEventId,
            room_id: replacementRoomId,
            auto_join: true,
            _type: "tombstone", // instrumentation

            // Try to join via the server that sent the event. This converts @something:example.org
            // into a server domain by splitting on colons and ignoring the first entry ("@something").
            via_servers: viaServers,
            opts: {
                // These are passed down to the js-sdk's /join call
                viaServers: viaServers,
            },
        });
    }

    renderPlaceholderText() {
        if (this.props.replyToEvent) {
            if (this.props.e2eStatus) {
                return _t('Send an encrypted reply…');
            } else {
                return _t('Send a reply…');
            }
        } else {
            if (this.props.e2eStatus) {
                return _t('Send an encrypted message…');
            } else {
                return _t('Send a message…');
            }
        }
    }

    addEmoji(emoji) {
        dis.dispatch({
            action: "insert_emoji",
            emoji,
        });
    }

    render() {
        const controls = [
            this.state.me ? <ComposerAvatar key="controls_avatar" me={this.state.me} /> : null,
        ];

        if (!this.state.tombstone && this.state.canSendMessages) {
            // This also currently includes the call buttons. Really we should
            // check separately for whether we can call, but this is slightly
            // complex because of conference calls.

            const SendMessageComposer = sdk.getComponent("rooms.SendMessageComposer");
            const callInProgress = this.props.callState && this.props.callState !== 'ended';

            controls.push(
                <SendMessageComposer
                    ref={(c) => this.messageComposerInput = c}
                    key="controls_input"
                    room={this.props.room}
                    placeholder={this.renderPlaceholderText()}
                    resizeNotifier={this.props.resizeNotifier}
                    permalinkCreator={this.props.permalinkCreator}
                    replyToEvent={this.props.replyToEvent}
                />,
                <UploadButton key="controls_upload" roomId={this.props.room.roomId} />,
                <EmojiButton key="emoji_button" addEmoji={this.addEmoji} />,
            );

            if (SettingsStore.getValue(UIFeature.Widgets) &&
                SettingsStore.getValue("MessageComposerInput.showStickersButton")) {
                controls.push(<Stickerpicker key="stickerpicker_controls_button" room={this.props.room} />);
            }

            if (this.state.showCallButtons) {
                if (this.state.hasConference) {
                    const canEndConf = WidgetUtils.canUserModifyWidgets(this.props.room.roomId);
                    controls.push(
                        <HangupButton
                            key="controls_hangup"
                            roomId={this.props.room.roomId}
                            isConference={true}
                            canEndConference={canEndConf}
                            isInConference={this.state.joinedConference}
                        />,
                    );
                } else if (callInProgress) {
                    controls.push(
                        <HangupButton key="controls_hangup" roomId={this.props.room.roomId} isConference={false} />,
                    );
                } else {
                    controls.push(
                        <CallButton key="controls_call" roomId={this.props.room.roomId} />,
                        <VideoCallButton key="controls_videocall" roomId={this.props.room.roomId} />,
                    );
                }
            }
        } else if (this.state.tombstone) {
            const replacementRoomId = this.state.tombstone.getContent()['replacement_room'];

            const continuesLink = replacementRoomId ? (
                <a href={makeRoomPermalink(replacementRoomId)}
                    className="mx_MessageComposer_roomReplaced_link"
                    onClick={this._onTombstoneClick}
                >
                    {_t("The conversation continues here.")}
                </a>
            ) : '';

            controls.push(<div className="mx_MessageComposer_replaced_wrapper" key="room_replaced">
                <div className="mx_MessageComposer_replaced_valign">
                    <img className="mx_MessageComposer_roomReplaced_icon" src={require("../../../../res/img/room_replaced.svg")} />
                    <span className="mx_MessageComposer_roomReplaced_header">
                        {_t("This room has been replaced and is no longer active.")}
                    </span><br />
                    { continuesLink }
                </div>
            </div>);
        } else {
            controls.push(
                <div key="controls_error" className="mx_MessageComposer_noperm_error">
                    { _t('You do not have permission to post to this room') }
                </div>,
            );
        }

        return (
            <div className="mx_MessageComposer mx_GroupLayout">
                <div className="mx_MessageComposer_wrapper">
                    <ReplyPreview permalinkCreator={this.props.permalinkCreator} />
                    <div className="mx_MessageComposer_row">
                        { controls }
                    </div>
                </div>
            </div>
        );
    }
}

MessageComposer.propTypes = {
    // js-sdk Room object
    room: PropTypes.object.isRequired,

    // string representing the current voip call state
    callState: PropTypes.string,

    // string representing the current room app drawer state
    showApps: PropTypes.bool,
};
