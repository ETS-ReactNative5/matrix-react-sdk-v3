/*
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

import React, {useCallback, useState, useEffect, useContext} from "react";
import classNames from "classnames";
import {Room} from "matrix-js-sdk/src/models/room";
import {getHttpUriForMxc} from "matrix-js-sdk/src/content-repo";

import MatrixClientContext from "../../../contexts/MatrixClientContext";
import { useIsEncrypted } from '../../../hooks/useIsEncrypted';
import BaseCard, { Group } from "./BaseCard";
import { _t } from '../../../languageHandler';
import RoomAvatar from "../avatars/RoomAvatar";
import AccessibleButton from "../elements/AccessibleButton";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import {Action} from "../../../dispatcher/actions";
import {RightPanelPhases} from "../../../stores/RightPanelStorePhases";
import {SetRightPanelPhasePayload} from "../../../dispatcher/payloads/SetRightPanelPhasePayload";
import Modal from "../../../Modal";
import ShareDialog from '../dialogs/ShareDialog';
import {useEventEmitter} from "../../../hooks/useEventEmitter";
import WidgetEchoStore from "../../../stores/WidgetEchoStore";
import WidgetUtils from "../../../utils/WidgetUtils";
import {IntegrationManagers} from "../../../integrations/IntegrationManagers";
import SettingsStore from "../../../settings/SettingsStore";
import TextWithTooltip from "../elements/TextWithTooltip";
import BaseAvatar from "../avatars/BaseAvatar";
import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";
import WidgetStore, {IApp} from "../../../stores/WidgetStore";
import {MatrixClientPeg} from "../../../MatrixClientPeg";
import DMRoomMap from "../../../utils/DMRoomMap";
import Tchap from "../../../tchap/Tchap";

interface IProps {
    room: Room;
    onClose(): void;
    joinRules: string;
}

interface IAppsSectionProps {
    room: Room;
}

interface IButtonProps {
    className: string;
    onClick(): void;
}

interface IState {
    joinRules?: string;
    roomMemberCount?: number;
    room?: Room;
}

enum Icon {
    // Note: the names here are used in CSS class names
    None = "NONE", // ... except this one
    Encrypted = "ENCRYPTED",
    Forum = "FORUM",
}

const Button: React.FC<IButtonProps> = ({ children, className, onClick }) => {
    return <AccessibleButton
        className={classNames("mx_BaseCard_Button mx_RoomSummaryCard_Button", className)}
        onClick={onClick}
    >
        { children }
    </AccessibleButton>;
};

export const useWidgets = (room: Room) => {
    const [apps, setApps] = useState<IApp[]>(WidgetStore.instance.getApps(room));

    const updateApps = useCallback(() => {
        // Copy the array so that we always trigger a re-render, as some updates mutate the array of apps/settings
        setApps([...WidgetStore.instance.getApps(room)]);
    }, [room]);

    useEffect(updateApps, [room]);
    useEventEmitter(WidgetEchoStore, "update", updateApps);
    useEventEmitter(WidgetStore.instance, room.roomId, updateApps);

    return apps;
};

const tooltipText = (variant: Icon) => {
    switch (variant) {
        case Icon.Forum:
            return _t("Forum room");
        case Icon.Encrypted:
            return _t("Encrypted room");
    }
}

const AppsSection: React.FC<IAppsSectionProps> = ({ room }) => {
    const cli = useContext(MatrixClientContext);
    const apps = useWidgets(room);

    const onManageIntegrations = () => {
        const managers = IntegrationManagers.sharedInstance();
        if (!managers.hasManager()) {
            managers.openNoManagerDialog();
        } else {
            if (SettingsStore.getValue("feature_many_integration_managers")) {
                managers.openAll(room);
            } else {
                managers.getPrimaryManager().open(room);
            }
        }
    };

    return <Group className="mx_RoomSummaryCard_appsGroup" title={_t("Widgets")}>
        { apps.map(app => {
            const name = WidgetUtils.getWidgetName(app);
            const dataTitle = WidgetUtils.getWidgetDataTitle(app);
            const subtitle = dataTitle && " - " + dataTitle;

            let iconUrls = [require("../../../../res/img/element-icons/room/default_app.svg")];
            // heuristics for some better icons until Widgets support their own icons
            if (app.type.includes("meeting") || app.type.includes("calendar")) {
                iconUrls = [require("../../../../res/img/element-icons/room/default_cal.svg")];
            } else if (app.type.includes("pad") || app.type.includes("doc") || app.type.includes("calc")) {
                iconUrls = [require("../../../../res/img/element-icons/room/default_doc.svg")];
            } else if (app.type.includes("clock")) {
                iconUrls = [require("../../../../res/img/element-icons/room/default_clock.svg")];
            }

            if (app.avatar_url) { // MSC2765
                iconUrls.unshift(getHttpUriForMxc(cli.getHomeserverUrl(), app.avatar_url, 20, 20, "crop"));
            }

            const isPinned = WidgetStore.instance.isPinned(app.id);
            const classes = classNames("mx_RoomSummaryCard_icon_app", {
                mx_RoomSummaryCard_icon_app_pinned: isPinned,
            });

            if (isPinned) {
                const onClick = () => {
                    WidgetStore.instance.unpinWidget(app.id);
                };

                return <AccessibleTooltipButton
                    key={app.id}
                    className={classNames("mx_BaseCard_Button mx_RoomSummaryCard_Button", classes)}
                    onClick={onClick}
                    title={_t("Unpin app")}
                >
                    <BaseAvatar name={app.id} urls={iconUrls} width={20} height={20} />
                    <span>{name}</span>
                    { subtitle }
                </AccessibleTooltipButton>
            }

            const onOpenWidgetClick = () => {
                defaultDispatcher.dispatch<SetRightPanelPhasePayload>({
                    action: Action.SetRightPanelPhase,
                    phase: RightPanelPhases.Widget,
                    refireParams: {
                        widgetId: app.id,
                    },
                });
            };

            return (
                <Button key={app.id} className={classes} onClick={onOpenWidgetClick}>
                    <BaseAvatar name={app.id} urls={iconUrls} width={20} height={20} />
                    <span>{name}</span>
                    { subtitle }
                </Button>
            );
        }) }

        <AccessibleButton kind="link" onClick={onManageIntegrations}>
            { apps.length > 0 ? _t("Edit widgets, bridges & bots") : _t("Add widgets, bridges & bots") }
        </AccessibleButton>
    </Group>;
};

const onRoomMembersClick = () => {
    defaultDispatcher.dispatch<SetRightPanelPhasePayload>({
        action: Action.SetRightPanelPhase,
        phase: RightPanelPhases.RoomMemberList,
    });
};

const onRoomFilesClick = () => {
    defaultDispatcher.dispatch<SetRightPanelPhasePayload>({
        action: Action.SetRightPanelPhase,
        phase: RightPanelPhases.FilePanel,
    });
};

const onRoomSettingsClick = () => {
    defaultDispatcher.dispatch({ action: "open_room_settings" });
};


export default class RoomSummaryCard extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);
        this.state = {
            joinRules: props.joinRules,
            room: props.room,
        }
    }

    public componentDidMount() {
        this.setState({
            roomMemberCount: this.state.room.getJoinedMembers().length
        });
        MatrixClientPeg.get().on('RoomState.joinRules', data => {
            this.setState({
                joinRules: data,
            })
        });
    }

    private onShareRoomClick = () => {
        const isRoomForum = Tchap.isRoomForum(this.props.room.roomId);
        const accessRules = Tchap.getAccessRules(this.props.room.roomId);
        Modal.createTrackedDialog('share room dialog', '', ShareDialog, {
            target: this.state.room,
            isExtShared: accessRules === "unrestricted" && this.state.joinRules === "public" && !isRoomForum,
        });
    }

    public render() {
        const room = this.state.room;
        const isForumRoom = Tchap.isRoomForum(this.props.room.roomId);
        const accessRules = Tchap.getAccessRules(this.props.room.roomId);

        let icon;
        if (isForumRoom) {
            icon = Icon.Forum
        } else {
            icon = Icon.Encrypted
        }
        let roomIcon: React.ReactNode;
        if (icon !== Icon.None) {
            roomIcon  = (
                <TextWithTooltip
                    tooltip={tooltipText(icon)}
                    class={`tc_DecoratedRoomSummaryCard_icon tc_DecoratedRoomSummaryCard_icon_${icon.toLowerCase()}`}
                />
            );
        }

        const dmRoomMap = new DMRoomMap(MatrixClientPeg.get());
        const isDMRoom = Boolean(dmRoomMap.getUserIdForRoomId(room.roomId));

        let roomCardAvatarClasses = "mx_RoomSummaryCard_avatar";
        let multiRoomOpts = null;
        if (!isDMRoom) {
            // Set-up avatar custom properties.
            roomCardAvatarClasses += accessRules === "unrestricted" ?
                " tc_RoomSummaryCard_avatar_hexa_unrestricted" : " tc_RoomSummaryCard_avatar_hexa";

            // Show share button only if a room is a forum or if the join_rules is public.
            let shareRoom = null;
            if (isForumRoom || this.state.joinRules === "public") {
                shareRoom = (
                    <Button className="mx_RoomSummaryCard_icon_share" onClick={this.onShareRoomClick}>
                        {_t("Share room")}
                    </Button>
                );
            }

            // Show room seting only if is not a direct room.
            multiRoomOpts = (
                <>
                    { shareRoom }
                    <Button className="mx_RoomSummaryCard_icon_settings" onClick={onRoomSettingsClick}>
                        {_t("Room settings")}
                    </Button>
                </>
            );
        }

        const header = <React.Fragment>
            { roomIcon }
            <div className={roomCardAvatarClasses} role="presentation">
                <RoomAvatar room={room} height={54} width={54} viewAvatarOnClick />
            </div>

            <h2 title={room.name}>{ room.name }</h2>
        </React.Fragment>;

        const memberCount = this.state.roomMemberCount;

        return <BaseCard header={header} className="mx_RoomSummaryCard" onClose={this.props.onClose}>
            <Group title={_t("About")} className="mx_RoomSummaryCard_aboutGroup">
                <Button className="mx_RoomSummaryCard_icon_people" onClick={onRoomMembersClick}>
                    {_t("%(count)s people", { count: memberCount })}
                </Button>
                <Button className="mx_RoomSummaryCard_icon_files" onClick={onRoomFilesClick}>
                    {_t("Show files")}
                </Button>
                { multiRoomOpts }
            </Group>
        </BaseCard>;
    }
}
