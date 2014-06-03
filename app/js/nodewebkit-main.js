/*#############################################################
NODEWEBKIT MAIN JS
#############################################################*/

//nodewebkit  user interface object
var gui = require('nw.gui');

//window
var win = gui.Window.get();

//create menu bar
var menubar = new gui.Menu({ type: "menubar"});

//create file menu
var file = new gui.Menu();

file.append(new gui.MenuItem({
	label : 'Restart',
	click : function(){
		location.reload();
	}
}));

//file.append(new gui.MenuItem({
//	type : 'separator'
//}));
//
//file.append(new gui.MenuItem({
//	label : 'Close',
//	click : function(){
//		gui.Window.get().close();
//	}
//}));


//assign to existing menu
win.menu = menubar;

//use insert rather than append to place before default edit menu
win.menu.insert(new gui.MenuItem({
	label : "File",
	submenu : file
}), 1);

