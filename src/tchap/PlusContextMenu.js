import React from 'react';
import AccessibleButton from "../components/views/elements/AccessibleButton";
import dis from "../dispatcher/dispatcher";
import {_t} from "../languageHandler";

export default class PlusContextMenu extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			visible: 'hidden',
			x: 0,
			y: 0,
			opacity: 0,
		};
	}

	componentDidMount() {
		document.addEventListener('click', this.handleClickOutside, true);
	}

	componentWillUnmount() {
		document.removeEventListener('click', this.handleClickOutside, true);
	}

	handleClickOutside() {
		this.setState({
			visible: 'hidden',
			opacity: 0,
		})
	}

	_onPlusClicked(e) {
		e.preventDefault();
		this.setState({
			visible: 'visible',
			opacity: 1,
			x: e.clientX + 'px',
			y: (e.clientY - 104) + 'px',
		})
	}

	onAddRoom() {
		dis.dispatch({action: 'view_create_room'});
	}

	onStartChat() {
		dis.dispatch({action: 'view_create_chat'});
	}

	onExplore() {
		dis.dispatch({action: 'view_room_directory'});
	}

	_generateSubMenu() {
		return (
			<div className="tc_PlusContextMenu_sub">
				<div className="tc_PlusContextMenu_sub_item" onClick={this.onStartChat}>
					<img src={require('../../res/img/tchap/start-chat_logo.svg')} alt="start-chat_logo" className="tc_PlusContextMenu_sub_img" />
					{ _t("Start chat") }
				</div>
				<hr className="tc_PlusContextMenu_sub_separator" role="separator" />
				<div className="tc_PlusContextMenu_sub_item" onClick={this.onAddRoom}>
					<img src={require('../../res/img/tchap/start-room_logo.svg')} alt="start-chat_logo" className="tc_PlusContextMenu_sub_img" />
					{ _t("Create new room") }
				</div>
				<hr className="tc_PlusContextMenu_sub_separator" role="separator" />
				<div className="tc_PlusContextMenu_sub_item" onClick={this.onExplore}>
					<img src={require('../../res/img/tchap/explore_logo.svg')} alt="start-chat_logo" className="tc_PlusContextMenu_sub_img" />
					{ _t("Room directory") }
				</div>
			</div>
		);
	}

	render() {
		const styles = {
				position: 'absolute',
				left: this.state.x,
				top: this.state.y,
				visibility: this.state.visible,
				opacity: this.state.opacity,
			};
		const submenu = this._generateSubMenu();
		return <div className="tc_LeftPanel_Button_cross">
			<AccessibleButton className="tc_LeftPanel_Button_cross_btn" onClick={this._onPlusClicked}>
			</AccessibleButton>
			<div className="tc_PlusContextMenu"
				style={styles}>
				{ submenu }
			</div>
		</div>
	}
}

