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

import * as React from "react";
import { createRef } from "react";
import GroupFilterPanel from "./GroupFilterPanel";
import CustomRoomTagPanel from "./CustomRoomTagPanel";
import classNames from "classnames";
import dis from "../../dispatcher/dispatcher";
import { _t } from "../../languageHandler";
import RoomList from "../views/rooms/RoomList";
import { HEADER_HEIGHT } from "../views/rooms/RoomSublist";
import { Action } from "../../dispatcher/actions";
import UserMenu from "./UserMenu";
import RoomSearch from "./RoomSearch";
import RoomBreadcrumbs from "../views/rooms/RoomBreadcrumbs";
import { BreadcrumbsStore } from "../../stores/BreadcrumbsStore";
import { UPDATE_EVENT } from "../../stores/AsyncStore";
import ResizeNotifier from "../../utils/ResizeNotifier";
import SettingsStore from "../../settings/SettingsStore";
import RoomListStore, { LISTS_UPDATE_EVENT } from "../../stores/room-list/RoomListStore";
import {Key} from "../../Keyboard";
import IndicatorScrollbar from "../structures/IndicatorScrollbar";
import AccessibleTooltipButton from "../views/elements/AccessibleTooltipButton";
import { OwnProfileStore } from "../../stores/OwnProfileStore";
import { MatrixClientPeg } from "../../MatrixClientPeg";
import RoomListNumResults from "../views/rooms/RoomListNumResults";
import LeftPanelWidget from "./LeftPanelWidget";
import SdkConfig from "../../SdkConfig";
import Tchap from "../../tchap/Tchap";
import ContentScanner from "../../tchap/utils/ContentScanner";

interface IProps {
    isMinimized: boolean;
    resizeNotifier: ResizeNotifier;
}

interface IState {
    showBreadcrumbs: boolean;
    showGroupFilterPanel: boolean;
}

// List of CSS classes which should be included in keyboard navigation within the room list
const cssClasses = [
    "mx_RoomSearch_input",
    "mx_RoomSearch_minimizedHandle", // minimized <RoomSearch />
    "mx_RoomSublist_headerText",
    "mx_RoomTile",
    "mx_RoomSublist_showNButton",
];

export default class LeftPanel extends React.Component<IProps, IState> {
    private listContainerRef: React.RefObject<HTMLDivElement> = createRef();
    private groupFilterPanelWatcherRef: string;
    private bgImageWatcherRef: string;
    private focusedElement = null;
    private isDoingStickyHeaders = false;

    constructor(props: IProps) {
        super(props);

        this.state = {
            showBreadcrumbs: BreadcrumbsStore.instance.visible,
            showGroupFilterPanel: SettingsStore.getValue('TagPanel.enableTagPanel'),
        };

        BreadcrumbsStore.instance.on(UPDATE_EVENT, this.onBreadcrumbsUpdate);
        RoomListStore.instance.on(LISTS_UPDATE_EVENT, this.onBreadcrumbsUpdate);
        OwnProfileStore.instance.on(UPDATE_EVENT, this.onBackgroundImageUpdate);
        this.bgImageWatcherRef = SettingsStore.watchSetting(
            "RoomList.backgroundImage", null, this.onBackgroundImageUpdate);
        this.groupFilterPanelWatcherRef = SettingsStore.watchSetting("TagPanel.enableTagPanel", null, () => {
            this.setState({showGroupFilterPanel: SettingsStore.getValue("TagPanel.enableTagPanel")});
        });

        // We watch the middle panel because we don't actually get resized, the middle panel does.
        // We listen to the noisy channel to avoid choppy reaction times.
        this.props.resizeNotifier.on("middlePanelResizedNoisy", this.onResize);
    }

    public componentWillUnmount() {
        SettingsStore.unwatchSetting(this.groupFilterPanelWatcherRef);
        SettingsStore.unwatchSetting(this.bgImageWatcherRef);
        BreadcrumbsStore.instance.off(UPDATE_EVENT, this.onBreadcrumbsUpdate);
        RoomListStore.instance.off(LISTS_UPDATE_EVENT, this.onBreadcrumbsUpdate);
        OwnProfileStore.instance.off(UPDATE_EVENT, this.onBackgroundImageUpdate);
        this.props.resizeNotifier.off("middlePanelResizedNoisy", this.onResize);
    }

    private onExplore = () => {
        dis.fire(Action.ViewRoomDirectory);
    };

    private onBreadcrumbsUpdate = () => {
        const newVal = BreadcrumbsStore.instance.visible;
        if (newVal !== this.state.showBreadcrumbs) {
            this.setState({showBreadcrumbs: newVal});

            // Update the sticky headers too as the breadcrumbs will be popping in or out.
            if (!this.listContainerRef.current) return; // ignore: no headers to sticky
            this.handleStickyHeaders(this.listContainerRef.current);
        }
    };

    private onBackgroundImageUpdate = () => {
        // Note: we do this in the LeftPanel as it uses this variable most prominently.
        const avatarSize = 32; // arbitrary
        let avatarUrl = OwnProfileStore.instance.getHttpAvatarUrl(avatarSize);
        const settingBgMxc = SettingsStore.getValue("RoomList.backgroundImage");
        if (settingBgMxc) {
            avatarUrl = MatrixClientPeg.get().mxcUrlToHttp(settingBgMxc, avatarSize, avatarSize);
        }
        let scAvatarUrl = null;
        if (avatarUrl) {
            scAvatarUrl = ContentScanner.getUnencryptedContentUrl({url: Tchap.imgUrlToUri(avatarUrl)}, true);
        }
        const avatarUrlProp = `url(${scAvatarUrl})`;
        if (!avatarUrl) {
            document.body.style.removeProperty("--avatar-url");
        } else if (document.body.style.getPropertyValue("--avatar-url") !== avatarUrlProp) {
            document.body.style.setProperty("--avatar-url", avatarUrlProp);
        }
    };

    private handleStickyHeaders(list: HTMLDivElement) {
        if (this.isDoingStickyHeaders) return;
        this.isDoingStickyHeaders = true;
        window.requestAnimationFrame(() => {
            this.doStickyHeaders(list);
            this.isDoingStickyHeaders = false;
        });
    }

    private doStickyHeaders(list: HTMLDivElement) {
        const topEdge = list.scrollTop;
        const bottomEdge = list.offsetHeight + list.scrollTop;
        const sublists = list.querySelectorAll<HTMLDivElement>(".mx_RoomSublist");

        const headerRightMargin = 15; // calculated from margins and widths to align with non-sticky tiles
        const headerStickyWidth = list.clientWidth - headerRightMargin;

        // We track which styles we want on a target before making the changes to avoid
        // excessive layout updates.
        const targetStyles = new Map<HTMLDivElement, {
            stickyTop?: boolean;
            stickyBottom?: boolean;
            makeInvisible?: boolean;
        }>();

        let lastTopHeader;
        let firstBottomHeader;
        for (const sublist of sublists) {
            const header = sublist.querySelector<HTMLDivElement>(".mx_RoomSublist_stickable");
            header.style.removeProperty("display"); // always clear display:none first

            // When an element is <=40% off screen, make it take over
            const offScreenFactor = 0.4;
            const isOffTop = (sublist.offsetTop + (offScreenFactor * HEADER_HEIGHT)) <= topEdge;
            const isOffBottom = (sublist.offsetTop + (offScreenFactor * HEADER_HEIGHT)) >= bottomEdge;

            if (isOffTop || sublist === sublists[0]) {
                targetStyles.set(header, { stickyTop: true });
                if (lastTopHeader) {
                    lastTopHeader.style.display = "none";
                    targetStyles.set(lastTopHeader, { makeInvisible: true });
                }
                lastTopHeader = header;
            } else if (isOffBottom && !firstBottomHeader) {
                targetStyles.set(header, { stickyBottom: true });
                firstBottomHeader = header;
            } else {
                targetStyles.set(header, {}); // nothing == clear
            }
        }

        // Run over the style changes and make them reality. We check to see if we're about to
        // cause a no-op update, as adding/removing properties that are/aren't there cause
        // layout updates.
        for (const header of targetStyles.keys()) {
            const style = targetStyles.get(header);

            if (style.makeInvisible) {
                // we will have already removed the 'display: none', so add it back.
                header.style.display = "none";
                continue; // nothing else to do, even if sticky somehow
            }

            if (style.stickyTop) {
                if (!header.classList.contains("mx_RoomSublist_headerContainer_stickyTop")) {
                    header.classList.add("mx_RoomSublist_headerContainer_stickyTop");
                }

                const newTop = `${list.parentElement.offsetTop}px`;
                if (header.style.top !== newTop) {
                    header.style.top = newTop;
                }
            } else {
                if (header.classList.contains("mx_RoomSublist_headerContainer_stickyTop")) {
                    header.classList.remove("mx_RoomSublist_headerContainer_stickyTop");
                }
                if (header.style.top) {
                    header.style.removeProperty('top');
                }
            }

            if (style.stickyBottom) {
                if (!header.classList.contains("mx_RoomSublist_headerContainer_stickyBottom")) {
                    header.classList.add("mx_RoomSublist_headerContainer_stickyBottom");
                }

                const offset = window.innerHeight - (list.parentElement.offsetTop + list.parentElement.offsetHeight);
                const newBottom = `${offset}px`;
                if (header.style.bottom !== newBottom) {
                    header.style.bottom = newBottom;
                }
            } else {
                if (header.classList.contains("mx_RoomSublist_headerContainer_stickyBottom")) {
                    header.classList.remove("mx_RoomSublist_headerContainer_stickyBottom");
                }
                if (header.style.bottom) {
                    header.style.removeProperty('bottom');
                }
            }

            if (style.stickyTop || style.stickyBottom) {
                if (!header.classList.contains("mx_RoomSublist_headerContainer_sticky")) {
                    header.classList.add("mx_RoomSublist_headerContainer_sticky");
                }

                const newWidth = `${headerStickyWidth}px`;
                if (header.style.width !== newWidth) {
                    header.style.width = newWidth;
                }
            } else if (!style.stickyTop && !style.stickyBottom) {
                if (header.classList.contains("mx_RoomSublist_headerContainer_sticky")) {
                    header.classList.remove("mx_RoomSublist_headerContainer_sticky");
                }
                if (header.style.width) {
                    header.style.removeProperty('width');
                }
            }
        }

        // add appropriate sticky classes to wrapper so it has
        // the necessary top/bottom padding to put the sticky header in
        const listWrapper = list.parentElement; // .mx_LeftPanel_roomListWrapper
        if (lastTopHeader) {
            listWrapper.classList.add("mx_LeftPanel_roomListWrapper_stickyTop");
        } else {
            listWrapper.classList.remove("mx_LeftPanel_roomListWrapper_stickyTop");
        }
        if (firstBottomHeader) {
            listWrapper.classList.add("mx_LeftPanel_roomListWrapper_stickyBottom");
        } else {
            listWrapper.classList.remove("mx_LeftPanel_roomListWrapper_stickyBottom");
        }
    }

    private onScroll = (ev: React.MouseEvent<HTMLDivElement>) => {
        const list = ev.target as HTMLDivElement;
        this.handleStickyHeaders(list);
    };

    private onResize = () => {
        if (!this.listContainerRef.current) return; // ignore: no headers to sticky
        this.handleStickyHeaders(this.listContainerRef.current);
    };

    private onFocus = (ev: React.FocusEvent) => {
        this.focusedElement = ev.target;
    };

    private onBlur = () => {
        this.focusedElement = null;
    };

    private onKeyDown = (ev: React.KeyboardEvent) => {
        if (!this.focusedElement) return;

        switch (ev.key) {
            case Key.ARROW_UP:
            case Key.ARROW_DOWN:
                ev.stopPropagation();
                ev.preventDefault();
                this.onMoveFocus(ev.key === Key.ARROW_UP);
                break;
        }
    };

    private onEnter = () => {
        const firstRoom = this.listContainerRef.current.querySelector<HTMLDivElement>(".mx_RoomTile");
        if (firstRoom) {
            firstRoom.click();
            return true; // to get the field to clear
        }
    };

    private onMoveFocus = (up: boolean) => {
        let element = this.focusedElement;

        let descending = false; // are we currently descending or ascending through the DOM tree?
        let classes: DOMTokenList;

        do {
            const child = up ? element.lastElementChild : element.firstElementChild;
            const sibling = up ? element.previousElementSibling : element.nextElementSibling;

            if (descending) {
                if (child) {
                    element = child;
                } else if (sibling) {
                    element = sibling;
                } else {
                    descending = false;
                    element = element.parentElement;
                }
            } else {
                if (sibling) {
                    element = sibling;
                    descending = true;
                } else {
                    element = element.parentElement;
                }
            }

            if (element) {
                classes = element.classList;
            }
        } while (element && !cssClasses.some(c => classes.contains(c)));

        if (element) {
            element.focus();
            this.focusedElement = element;
        }
    };

    private renderHeader(): React.ReactNode {
        return (
            <div className="mx_LeftPanel_userHeader">
                <UserMenu isMinimized={this.props.isMinimized} />
            </div>
        );
    }

    private renderBreadcrumbs(): React.ReactNode {
        if (this.state.showBreadcrumbs && !this.props.isMinimized) {
            return (
                <IndicatorScrollbar
                    className="mx_LeftPanel_breadcrumbsContainer mx_AutoHideScrollbar"
                    verticalScrollsHorizontally={true}
                    // Firefox sometimes makes this element focusable due to
                    // overflow:scroll;, so force it out of tab order.
                    tabIndex={-1}
                >
                    <RoomBreadcrumbs />
                </IndicatorScrollbar>
            );
        }
    }

    private renderSearchExplore(): React.ReactNode {
        const userId = MatrixClientPeg.get().getUserId();
        const isUserExtern = Tchap.isUserExtern(userId);

        let exploreButton = null;
        if (!isUserExtern) {
            exploreButton = (<AccessibleTooltipButton
                className="mx_LeftPanel_exploreButton"
                onClick={this.onExplore}
                title={_t("Explore rooms")}
            />);
        }

        return (
            <div
                className="mx_LeftPanel_filterContainer"
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                onKeyDown={this.onKeyDown}
            >
                <RoomSearch
                    isMinimized={this.props.isMinimized}
                    onVerticalArrow={this.onKeyDown}
                    onEnter={this.onEnter}
                />
                { exploreButton }
            </div>
        );
    }

    public render(): React.ReactNode {
        const groupFilterPanel = !this.state.showGroupFilterPanel ? null : (
            <div className="mx_LeftPanel_GroupFilterPanelContainer">
                <GroupFilterPanel />
                {SettingsStore.getValue("feature_custom_tags") ? <CustomRoomTagPanel /> : null}
            </div>
        );

        let bottomPanel;
        if (!this.props.isMinimized) {
            bottomPanel = (
                <div className="tc_LeftPanel_Bottom">
                    <div className="tc_LeftPanel_Bottom_logo">
                        <img src={require('../../../res/img/tchap/logo_rep_fr_v2.svg')} alt="logo_rep_fr" />
                    </div>
                    <div className="tc_LeftPanel_Bottom_links">
                        <a href={SdkConfig.get().base_host_url + SdkConfig.get().generic_endpoints.faq} rel='noreferrer nofollow noopener' target='_blank'>{_t('FAQ')}</a>&nbsp;·&nbsp;
                        <a href={SdkConfig.get().base_host_url + SdkConfig.get().generic_endpoints.tac} rel='noreferrer nofollow noopener' target='_blank'>{_t('TAC')}</a>&nbsp;·&nbsp;
                        <a href={SdkConfig.get().base_host_url + SdkConfig.get().generic_endpoints.user_guide} rel='noreferrer nofollow noopener' target='_blank'>{_t('User Guide')}</a>
                    </div>
                </div>
            );
        } else {
            bottomPanel = (
                <div className="tc_LeftPanel_Bottom_logo_collapsed">
                    <img src={require('../../../res/img/tchap/logo_rep_fr_v2.svg')} alt="logo_rep_fr" />
                </div>
            );
        }

        const roomList = <RoomList
            onKeyDown={this.onKeyDown}
            resizeNotifier={null}
            onFocus={this.onFocus}
            onBlur={this.onBlur}
            isMinimized={this.props.isMinimized}
            onResize={this.onResize}
        />;

        const containerClasses = classNames({
            "mx_LeftPanel": true,
            "mx_LeftPanel_hasGroupFilterPanel": !!groupFilterPanel,
            "mx_LeftPanel_minimized": this.props.isMinimized,
        });

        const roomListClasses = classNames(
            "mx_LeftPanel_actualRoomListContainer",
            "mx_AutoHideScrollbar",
        );

        return (
            <div className={containerClasses}>
                {groupFilterPanel}
                <aside className="mx_LeftPanel_roomListContainer">
                    {this.renderHeader()}
                    {this.renderSearchExplore()}
                    {this.renderBreadcrumbs()}
                    <RoomListNumResults />
                    <div className="mx_LeftPanel_roomListWrapper">
                        <div
                            className={roomListClasses}
                            onScroll={this.onScroll}
                            ref={this.listContainerRef}
                            // Firefox sometimes makes this element focusable due to
                            // overflow:scroll;, so force it out of tab order.
                            tabIndex={-1}
                        >
                            {roomList}
                        </div>
                    </div>
                    { !this.props.isMinimized && <LeftPanelWidget onResize={this.onResize} /> }
                    { bottomPanel }
                </aside>
            </div>
        );
    }
}
