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
import WidgetUtils from "../../../utils/WidgetUtils";
import {IntegrationManagers} from "../../../integrations/IntegrationManagers";
import SettingsStore from "../../../settings/SettingsStore";
import TextWithTooltip from "../elements/TextWithTooltip";
import WidgetAvatar from "../avatars/WidgetAvatar";
import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";
import WidgetStore, {IApp} from "../../../stores/WidgetStore";
import { E2EStatus } from "../../../utils/ShieldUtils";
import RoomContext from "../../../contexts/RoomContext";
import {UIFeature} from "../../../settings/UIFeature";
import {ChevronFace, ContextMenuTooltipButton, useContextMenu} from "../../structures/ContextMenu";
import WidgetContextMenu from "../context_menus/WidgetContextMenu";
import {useRoomMemberCount} from "../../../hooks/useRoomMembers";
import { Container, MAX_PINNED, WidgetLayoutStore } from "../../../stores/widgets/WidgetLayoutStore";
import {MatrixClientPeg} from "../../../MatrixClientPeg";
import DMRoomMap from "../../../utils/DMRoomMap";
import Tchap from "../../../tchap/Tchap";

interface IProps {
    room: Room;
    joinRules: string;
    onClose(): void;
}

interface IAppsSectionProps {
    room: Room;
}

interface IButtonProps {
    className: string;
    onClick(): void;
}

const Button: React.FC<IButtonProps> = ({ children, className, onClick }) => {
    return <AccessibleButton
        className={classNames("mx_BaseCard_Button mx_RoomSummaryCard_Button", className)}
        onClick={onClick}
    >
        { children }
    </AccessibleButton>;
};

enum Icon {
    // Note: the names here are used in CSS class names
    None = "NONE", // ... except this one
    Encrypted = "ENCRYPTED",
    Forum = "FORUM",
}

export const useWidgets = (room: Room) => {
    const [apps, setApps] = useState<IApp[]>(WidgetStore.instance.getApps(room.roomId));

    const updateApps = useCallback(() => {
        // Copy the array so that we always trigger a re-render, as some updates mutate the array of apps/settings
        setApps([...WidgetStore.instance.getApps(room.roomId)]);
    }, [room]);

    useEffect(updateApps, [room, updateApps]);
    useEventEmitter(WidgetStore.instance, room.roomId, updateApps);
    useEventEmitter(WidgetLayoutStore.instance, WidgetLayoutStore.emissionForRoom(room), updateApps);

    return apps;
};

interface IAppRowProps {
    app: IApp;
    room: Room;
}

const AppRow: React.FC<IAppRowProps> = ({ app, room }) => {
    const name = WidgetUtils.getWidgetName(app);
    const dataTitle = WidgetUtils.getWidgetDataTitle(app);
    const subtitle = dataTitle && " - " + dataTitle;

    const onOpenWidgetClick = () => {
        defaultDispatcher.dispatch<SetRightPanelPhasePayload>({
            action: Action.SetRightPanelPhase,
            phase: RightPanelPhases.Widget,
            refireParams: {
                widgetId: app.id,
            },
        });
    };

    const isPinned = WidgetLayoutStore.instance.isInContainer(room, app, Container.Top);
    const togglePin = isPinned
        ? () => { WidgetLayoutStore.instance.moveToContainer(room, app, Container.Right); }
        : () => { WidgetLayoutStore.instance.moveToContainer(room, app, Container.Top); };

    const [menuDisplayed, handle, openMenu, closeMenu] = useContextMenu<HTMLDivElement>();
    let contextMenu;
    if (menuDisplayed) {
        const rect = handle.current.getBoundingClientRect();
        contextMenu = <WidgetContextMenu
            chevronFace={ChevronFace.None}
            right={window.innerWidth - rect.right}
            bottom={window.innerHeight - rect.top}
            onFinished={closeMenu}
            app={app}
        />;
    }

    const cannotPin = !isPinned && !WidgetLayoutStore.instance.canAddToContainer(room, Container.Top);

    let pinTitle: string;
    if (cannotPin) {
        pinTitle = _t("You can only pin up to %(count)s widgets", { count: MAX_PINNED });
    } else {
        pinTitle = isPinned ? _t("Unpin") : _t("Pin");
    }

    const classes = classNames("mx_BaseCard_Button mx_RoomSummaryCard_Button", {
        mx_RoomSummaryCard_Button_pinned: isPinned,
    });

    return <div className={classes} ref={handle}>
        <AccessibleTooltipButton
            className="mx_RoomSummaryCard_icon_app"
            onClick={onOpenWidgetClick}
            // only show a tooltip if the widget is pinned
            title={isPinned ? _t("Unpin a widget to view it in this panel") : ""}
            forceHide={!isPinned}
            disabled={isPinned}
            yOffset={-48}
        >
            <WidgetAvatar app={app} />
            <span>{name}</span>
            { subtitle }
        </AccessibleTooltipButton>

        <ContextMenuTooltipButton
            className="mx_RoomSummaryCard_app_options"
            isExpanded={menuDisplayed}
            onClick={openMenu}
            title={_t("Options")}
            yOffset={-24}
        />

        <AccessibleTooltipButton
            className="mx_RoomSummaryCard_app_pinToggle"
            onClick={togglePin}
            title={pinTitle}
            disabled={cannotPin}
            yOffset={-24}
        />

        { contextMenu }
    </div>;
};

const AppsSection: React.FC<IAppsSectionProps> = ({ room }) => {
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

    let copyLayoutBtn = null;
    if (apps.length > 0 && WidgetLayoutStore.instance.canCopyLayoutToRoom(room)) {
        copyLayoutBtn = (
            <AccessibleButton kind="link" onClick={() => WidgetLayoutStore.instance.copyLayoutToRoom(room)}>
                { _t("Set my room layout for everyone") }
            </AccessibleButton>
        );
    }

    return <Group className="mx_RoomSummaryCard_appsGroup" title={_t("Widgets")}>
        { apps.map(app => <AppRow key={app.id} app={app} room={room} />) }
        { copyLayoutBtn }
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

const RoomSummaryCard: React.FC<IProps> = ({ room, onClose }) => {
    const cli = useContext(MatrixClientContext);

    const onShareRoomClick = () => {
        Modal.createTrackedDialog('share room dialog', '', ShareDialog, {
            target: room,
        });
    };

    const isRoomEncrypted = useIsEncrypted(cli, room);
    const roomContext = useContext(RoomContext);
    const e2eStatus = roomContext.e2eStatus;
    const dmRoomMap = new DMRoomMap(MatrixClientPeg.get());
    const isDMRoom = Boolean(dmRoomMap.getUserIdForRoomId(room.roomId));
    const isRoomNotice = Tchap.isRoomNotice(room);
    const isForumRoom = Tchap.isRoomForum(room.roomId);
    const joinRule = Tchap.getJoinRules(room.roomId);
    const accessRules = Tchap.getAccessRules(room.roomId);

    let avatarSize = 54;
    let classes = "mx_RoomSummaryCard_avatar";

    if (!isDMRoom && !isRoomNotice) {
        classes += " tc_RoomSummaryCard_avatar_hexa";
        if (accessRules === "unrestricted") {
            classes += " tc_RoomSummaryCard_avatar_hexa_unrestricted";
            avatarSize = 50;
        }
    }

    const header = <React.Fragment>
        <div className={classes} role="presentation">
            <RoomAvatar room={room} height={avatarSize} width={avatarSize} viewAvatarOnClick />
        </div>
        <h2 title={room.name}>{ room.name }</h2>
    </React.Fragment>;

    const memberCount = useRoomMemberCount(room);

    let roomShare;
    if (!isDMRoom) {
        if (isForumRoom || joinRule === "public") {
            roomShare = (
                <Button className="mx_RoomSummaryCard_icon_share" onClick={onShareRoomClick}>
                    {_t("Share room")}
                </Button>
            );
        }
    }

    let roomTopic;
    let roomSettings;
    if (!isDMRoom && !isRoomNotice) {
        roomSettings = (
            <Button className="mx_RoomSummaryCard_icon_settings" onClick={onRoomSettingsClick}>
                {_t("Room settings")}
            </Button>
        );
        const ev = room.currentState.getStateEvents('m.room.topic', '');
        if (ev) {
            roomTopic = (
                <Group title={_t("Room Topic")} className="mx_RoomSummaryCard_aboutGroup">
                    <div className="tc_RoomSummaryCard_topic">{ev.getContent().topic}</div>
                </Group>
            );
        }

    }

    let showFiles;
    if (!isRoomNotice) {
        showFiles = (
            <Button className="mx_RoomSummaryCard_icon_files" onClick={onRoomFilesClick}>
                {_t("Show files")}
            </Button>
        );
    }

    return <BaseCard header={header} className="mx_RoomSummaryCard" onClose={onClose}>
        {roomTopic}
        <Group title={_t("About")} className="mx_RoomSummaryCard_aboutGroup">
            <Button className="mx_RoomSummaryCard_icon_people" onClick={onRoomMembersClick}>
                {_t("%(count)s people", { count: memberCount })}
            </Button>
            {showFiles}
            {roomShare}
            {roomSettings}
        </Group>
    </BaseCard>;
};

export default RoomSummaryCard;
