angular.module('typer.services', [])


	.factory('typerData', function() {
		var t = {};

		t.keystrokes = 0;               //total keystrokes
		t.incorrectKeystrokes = 0;      //
		t.average = 100;
		t.completion = 0;
		t.wpm = 0;
		t.correctWords = 0;             //amount of correct words typed
		t.wordTotal = 0;
		t.time = 0;                     //
		t.typedTotal = 0;
		t.perfectFlag = true;         //flag for any mistakes on an individual letter
		t.perfectWord = true;           //flag to check for word correctly typed
		t.incorrectWords = 0;
		t.textContent = "";             //
		t.letterTotal = 0;              //
		t.letterCount = { num : 0 };    //primitives have problems two-way binding in ng-repeat, use object references instead!!!
		t.correctPart = 0;              //
		t.incorrectPart = 0;            //
		t.progress = 0;                 //

		t.timerRunning = false;
		t.letterLimit = 1200;
		t.finished = false;
		t.modalOpened = false;

		return t;
	})

	.factory('typerLogic', function(){
		var calc = {};

		//calculate wpm
		calc.wpm = function(perfectWords, time) {
			var wpm;
			//if less than a minute then simply show correct words
			if (time < 60) {
				wpm = perfectWords;
			} else {
				wpm = Math.round(perfectWords / (time / 60));
			}
			return wpm;
		};


		var isInteger = function(value){
			if(typeof value === 'number') {
				return value % 1 === 0;
			}
		};

		calc.incorrectPortion = function(errorPercentage, completion) {
			var portion = 0;
			if(isInteger(errorPercentage) && isInteger(completion)){
				portion = Math.round((errorPercentage * 0.01) * completion);

			}
			return portion;
		};

		calc.correctPortion = function(incorrectBar, completion) {
			var part = 0;
			if(isInteger(incorrectBar) && isInteger(completion)) {
				part = completion - incorrectBar;
			} else {
				if(isNaN(incorrectBar)){
					part = completion;
				}
			}
			return part;
		};

		calc.percentage = function(part, total){
			var perc = 0;
			if(isInteger(part) && isInteger(total)) {
				perc = Math.round(((part / total) * 100));
			}
			return perc;
		};

		return calc;
	});