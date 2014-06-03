//APP NAME : TYPER
//VERSION : 3.0
//AUTHOR : JOSH MU
//DATE : 17 JANUARY 2013


//////////////////////////////////////////////////////
//####################   INIT   ####################
//////////////////////////////////////////////////////
window.onload = function () {
	typer = new Typer().init();
};


//app constructor
function Typer() {

	var USERNAME = prompt('What is your name?');

/////////////////////////////////////////////////////////
//####################   FIREBASE   ####################
/////////////////////////////////////////////////////////
	var fire = new Firebase('http://typer.firebaseio.com');



//////////////////////////////////////////////////////
//####################   MODAL   ####################
//////////////////////////////////////////////////////

	this.modal = modal = {};

	modal.init = this.init = function () {
		//show user text input
		userInput.start();
	};

//get user text
	var userInput = {};
	userInput.get = function () {
		//check ever half second
		userInput.timer = setInterval(userInput.process, 500);
	};

	userInput.convert = function (txt) {
		//remove line breaks and replace with <br> tags
		//included a space before tag so user doesn't jump from last letter of line to first letter of the next line (need to have a space inbetween)
		var txt = txt.replace(/\r\n?|\n/g, " ");
		//remove excess whitespace
		txt = txt.replace(/(\s{2,})/g, ' ');
		//remove an start and end whitespace
		txt = txt.replace(/^\s\s*/, '').replace(/\s*$/, '');
		return txt;
	};

	userInput.span = function (txt) {
		var output = '<p>';
		output += txt.split('').map(function (l) {
			return '<span>' + l + '</span>';
		}).join('');
		output += '</p>';
		return output;
	};

	userInput.start = function () {
		//check if view has been created
		userInputView.init();

		//process
		this.get();
	};

	userInput.process = function () {
		//check for input
		if (userInput.$ut.val().length < 1) return false;

		//stop timer (if there is one running)
		clearInterval(userInput.timer);
		//remove view
		userInputView.hide();
		//grab txt
		var txt = userInputView.$ut.val();
		//reset input
		userInputView.$ut.val("");
		//convert txt
		userInput.txt = userInput.convert(txt);
		//add spans
		userInput.html = userInput.span(userInput.txt);

		//create stats view
		view.stats.init();

		//add content
		textContent.insert(userInput.html);

		//start tutor
		typerApp.start();
	};


	/*
	 $('.cover').click();
	 //stop the check timer
	 clearInterval(textTimer);
	 //insert new text
	 $('.content>p').html(userText);
	 //reset variables
	 resetVars();
	 */

//tutor
	var typerApp = {};
	typerApp.start = function () {
		//highlight first letter
		textContent.selectFirstLetter();
		//turn on keyboard listener
		keyboard.on();
		//setup stats
		modal.stats = STATS = new this.Stats();
	};

	typerApp.process = function (e) {
		//check for first keypress
		if (!typerApp.timer) STATS.start();

		//correct or incorrect
		this.check(e) ? this.next(e) : this.incorrect(e);
	};

	typerApp.next = function (e) {
		//correct
		this.correctKeyPress(e);

		//move current key to previous key
		typerApp.prev = $('.selected');
		//update current key
		typerApp.curr = typerApp.prev.next();
		//update selected class
		typerApp.curr.addClass('selected');
		//process prev
		typerApp.prevProcess();
		//reset mistakes
		typerApp.consecutiveMistakes = 0;

		//check if now on a space (" ") therefore add word count
		STATS.updateWordCount();

		//check typerApp.curr @ end
		if (typerApp.curr.length === 0) {
			typerApp.finished();
		}

	};

	typerApp.prevProcess = function () {
		typerApp.prev.removeClass('selected').addClass('done');
		typerApp.prev.css('color', colorError(typerApp.consecutiveMistakes));
		if (typerApp.consecutiveMistakes > 0) {
			typerApp.prev.removeClass(function (index, css) {
				return css.match(/(^|\s)background-\S+/g).join(' ');
			});
		}
	};

	typerApp.incorrect = function (e) {
		typerApp.curr = $('.selected');

		//incorrect & update
		this.incorrectKeyPress(e);

		//increment consecutive mistakes
		this.consecutiveMistakes++;

		//css changes for user mistakes
		if (typerApp.consecutiveMistakes === 1) {
			//change color to yellow
			typerApp.curr.addClass('background-1');
		} else if (typerApp.consecutiveMistakes === 2) {
			//change color to orange
			typerApp.curr.removeClass('background-1').addClass('background-2');
		} else if (typerApp.consecutiveMistakes > 5) {
			// 5 incorrect answer simply skips to the next
			typerApp.next();
		} else {
			//change color to red
			typerApp.curr.removeClass('background-2').addClass('background-3');
		}

	};

	//generate darkness on number of errors
	function colorError(i) {
		return 'rgba(0,0,0,' + (i * 0.2).toFixed(1) + ')';
	}

	typerApp.check = function (e) {
		//every time a key is pressed
		this.everyKeyPress(e);

		//normalize
		var guess = e.keyCode ? e.keyCode : e.which;
		var answer = $('.selected').text().charCodeAt();

		//mystery keys
		answer = helpers.keycheck(answer);

		//console.log(guess, answer);
		return guess === answer;
	};


	typerApp.finished = function () {
		//fix stats
		STATS.updateWPM();

		//switch off clock
		clearInterval(typerApp.timer);
		typerApp.timer = false;
		//user alert
//		alert('finished!');

		statHistory.update();
		statHistory.getAndView();

		var $modal = $('#finishModal');
		helpers.updateFinishModal();
		//show modal
		$modal.modal('show');
		//when modal is showing
		$modal.on('shown.bs.modal', function (e) {
			wpmAnimation(STATS.wpm);

			//using width amount to control animation duration
			$modal.find('.progress-bar-success')
				.animate({
					width: STATS.average + '%'
				}, (STATS.average * 50), 'linear', function () {
					$(this).next()
						//errors progress bar can animate faster
						.animate({
							width: (100 - STATS.average) + '%'
						}, ((100 - STATS.average) * 50), 'linear');
				});

			//workaround to close modal with enter keypress
			$modal.on('keydown', function returnKey(e) {
				//if return key is pressed (13) or spacebar (32)
				if ((e.keyCode === 13 && e.which === 13) ||
					(e.keyCode === 32 && e.which === 32)) {
					//click the modal close button
					$modal.find('button.close').click();
					$modal.off('keydown', returnKey);
				}
			})

		});

		//remove stats
		view.stats.hide();

//		//remove user text content
//		textContent.remove();
		//turn off keyboard
		keyboard.off();
		//restart typer using bootstrap event for when modal finish box is closed
		$modal.on('hidden.bs.modal', modal.init);
	};

	typerApp.Stats = function () {
		this.typed = 0;
		this.mistakes = 0;
		this.average = 100;
		this.completion = 0;
		this.wpm = 0;
		this.wordCount = 0;
		this.totalWords = $('.content').text().split(' ').length;
		this.time = 0;
		this.typedTotal = $('span').length;
		this.perfectWord = true;
		this.incorrectWordCount = 0;
	};

	typerApp.Stats.prototype.startTimer = function () {
		var self = this;
		typerApp.timer = setInterval(function () {
			self.everySecond();
		}, 1000);
	};

	typerApp.Stats.prototype.start = function () {
		this.startTimer();
	};

	typerApp.Stats.prototype.updateCompletion = function () {
		this.completion = Math.round(((this.typed / this.typedTotal) * 100));
	};

	typerApp.Stats.prototype.updateWordCount = function () {
		var char = typerApp.curr.text().charCodeAt(0);
		if (char === 32 || typerApp.curr.length === 0) { //' ' spacebar...
			//if made mistakes on the current word then increment
			if (!this.perfectWord) this.incorrectWordCount++;
			//increment total word count
			view.stats.updateWordCount(++this.wordCount);
		}
	};

	typerApp.Stats.prototype.updateWPM = function () {
		//if less than a minute then simply show correct words
		if (this.time < 60) {
			this.wpm = this.wordCount - this.incorrectWordCount;
		} else {
			this.wpm = Math.round((this.wordCount - this.incorrectWordCount) / (this.time / 60));
		}
	};

	typerApp.Stats.prototype.updateAverage = function () {
		if (this.mistakes > 0 && this.typed > 0) this.average = Math.round(100 - ((this.mistakes / this.typed) * 100));
	};

	typerApp.correctKeyPress = function (e) {
		//update & increment
		view.stats.updateTyped(++STATS.typed);
//		STATS.typed++; //delete this if going to display typed

		STATS.updateCompletion();
		view.stats.updateCompletion(STATS.completion);

		//reset perfect word flag
		if (e.charCode === 32) STATS.perfectWord = true;

	};

	typerApp.incorrectKeyPress = function (e) {
		//update & increment
		view.stats.updateMistakes(++STATS.mistakes);
		STATS.perfectWord = false;
	};

	typerApp.Stats.prototype.everySecond = function () {
		//the things to do to stats every second
		view.stats.updateTimer(++this.time);
		//wpm
		this.updateWPM();
		view.stats.updateWPM(this.wpm);

	};

	typerApp.everyKeyPress = function (e) {
		e.preventDefault();

		//increment & update
		STATS.updateAverage();
		view.stats.updateAverage(STATS.average);

	};

//////////////////////////////////////////////////////
//####################   VIEW   ####################
//////////////////////////////////////////////////////

	var view = {};

//create stats box
	view.stats = {};
	view.stats.make = function () {
//		var statsBox = '<div class="status col-md-2 col-md-offset-8 col-xs-8">'
////			+ '<div class="typed">0</div>'
//			+ '<div class="wordCount">0</div>'
//			+ '<div class="mistakes">0</div>'
//			+ '<div class="average">100</div>'
////			+ '<div class="completion">0</div>'
//			+ '<div class="wpm">0</div>'
//			+ '<div class="timer notPaused">0:00</div>'
//			+ '</div>';
//		$(statsBox).appendTo($('.top')).hide();


		//set jquery references for the view
		view.stats.$status = $('.status');
		view.stats.$typed = $('.typed');
		view.stats.$wordCount = $('.wordCount');
		view.stats.$mistakes = $('.mistakes');
		view.stats.$average = $('.average');
		view.stats.$completion = $('.completion');
		view.stats.$wpm = $('.wpm');
		view.stats.$timer = $('.timer');
	};

	view.stats.show = function () {
		this.$status.fadeIn('slow');
	};

	view.stats.hide = function () {
		this.$status.fadeOut('slow', function(){
			view.stats.reset();
		});
	};

	view.stats.init = function () {
		this.make();
		this.show();
	};

//stats box update timer
	view.stats.updateTimer = function (n) {
		var output = helpers.convertTime(n);
		this.$timer.text(output);
	};

//stats box update number of keys pressed
	view.stats.updateTyped = function(n) {
		this.$typed.text(n);
	};

//stats box update mistakes
	view.stats.updateMistakes = function (n) {
		this.$mistakes.text(n);
	};

//stats box update completed status
	view.stats.updateCompletion = function (n) {
		this.$completion.text(n);
	};

//stats box update wpm
	view.stats.updateWPM = function (n) {
		this.$wpm.text(n);
	};

//stats box update average
	view.stats.updateAverage = function (n) {
		this.$average.text(n);
	};

//stats box update word count
	view.stats.updateWordCount = function (n) {
		this.$wordCount.text(n);
	};

//stats view reset
	view.stats.reset = function() {
		this.updateTyped(0);
		this.updateTimer(0);
		this.updateMistakes(0);
		this.updateCompletion(100);
		this.updateWPM(0);
		this.updateAverage(100);
		this.updateWordCount(0);
	};

//create text input box
	var userInputView = {};
	userInputView.make = function () {
//		var userText = '<input class="col-md-8" type="text" name="userText" id="userText" class="box" rows="1" placeholder="Paste text.">';
//		$(userText).appendTo($('.top'));

		//store reference
		this.$ut = userInput.$ut = $('#userText');

	};

	userInputView.show = function () {
		//fade in and set focus
		this.$ut.fadeIn('slow').focus();
	};

	userInputView.hide = function () {
		//hide & reset val
		this.$ut.hide();
	};

	userInputView.init = function () {
		this.make();
		this.show();
	};


//display content
	var textContent = {
		$c: $('.content')
	};
	textContent.insert = function (txt) {
		this.$c.html(txt).hide().fadeIn('slow');
	};

	textContent.remove = function () {
		this.$c.children('p').remove();
	};

	textContent.selectFirstLetter = function () {
		$('.content').find('span')[0].setAttribute('class', 'selected');
	};


//////////////////////////////////////////////////////
//####################   CONTROLS   ####################
//////////////////////////////////////////////////////

//listen for keypress
	var keyboard = {};
	keyboard.on = function () {
		$('html').on('keypress', function (e) {
			typerApp.process(e);
		});
	};

	keyboard.off = function () {
		$('html').off('keypress');
	};


//////////////////////////////////////////////////////
//####################   HELPERS   ####################
//////////////////////////////////////////////////////

	this.helpers = helpers = {};
	helpers.keycheck = function (answer) {
		//change mystery keys...
		switch (answer) {
			case 10:
				answer = 32;
				break;
			case 171:
				answer = 60;
				break;
			case 187:
				answer = 62;
				break;
			case 9:
				answer = 32;
				break;
			case 8220:
				answer = 34;
				break;
			case 8221:
				answer = 34;
				break;
			case 8212:
				answer = 45;
				break;
		}
		return answer;
	};

	//update modal
	helpers.updateFinishModal = function (statHistory) {
		var $modalBody = $('#finishModal').find('.modal-body');
		//update attribute and reset width for animation
		$modalBody.find('.progress-bar-success').attr('aria-valuenow', STATS.average).css('width', 0)
			//reset width of 'progress-bar-danger'
			.next().css('width', 0)
			//reset wpm to display 0 initially
			.parent().next().find('.finish-wpm').text('0');

	};

	//wpm ticker animation
	function wpmAnimation(score) {
		//exact duration calc based on progress bars
		var duration = 5000; //based of using the '50' in the animation duration
		var interval = duration / score;

		var $wpm = $('.finish-wpm');
		var counter = 0;
		var timer = setInterval(function(){
			counter++;
			score >= counter ? $wpm.text(counter) : clearInterval(timer);
		}, interval);
	}

	//firebase statistic history
	var statHistory = {};
	statHistory.update = function(){

		var result = {
			name : USERNAME,
			wpm : STATS.wpm
		};

		fire.push(result, function(err) {
			if(err) {
				console.log('data could not be updated:', err);
			} else {
				console.log('data successfully updated.');
			}
		});

	};
	statHistory.getAndView = function() {
		var results = [];
		var html = '';

		fire.on('child_added', function(snapshot) {
			if(snapshot.val() === null) {
				console.log('no data exists.');
			} else {
				console.log('adding child');

				results.push(snapshot.val());

				//compile and display results
				compileResults(results);

			}
		});
	};

	function compileResults(results) {
		console.log('compiling results');
		var html = '';
		var counter = 0;
		var limit = 20;
		//reset ul before adding li's
		$('.statHistory').html('');
		results.sort(function(a, b){
			if(a.wpm === b.wpm) {
				return 0;
			} else {
				return a.wpm <= b.wpm ? 1 : -1;
			}
		}).forEach(function(stat) {
			if(counter < limit) {
				$('<li class="text-info"><p>' + stat.wpm + ' - ' + stat.name + '</p></li>')
					.appendTo($('ul.statHistory'));
				counter++;
			}
		});
	}

	helpers.convertTime = function (n) {
		var minutes = Math.floor(n / 60);
		//include a '0' prefix if less than 10 in seconds
		var seconds = n % 60 < 10 ? "0" + (n % 60) : n % 60;
		return minutes + ":" + seconds;
	};

}//end of app constructor


//NOTES
//pause function
//auto-pause if nothing pressed in 5 seconds
//auto-resume on keypress
//function to generate color darkness on letter mistakes ie. controlling rgba()