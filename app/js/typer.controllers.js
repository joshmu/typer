angular.module('typer-controllers', [])

.controller('GlobalCtrl', function($scope, $log, typerData, typerLogic, $window) {

//######################## SERVICES ########################

	$scope.t = typerData;

	$scope.calc = typerLogic;


//######################## CALC PROGRESS ########################

	$scope.completion = function(){
		return $scope.calc.percentage($scope.t.letterCount.num, $scope.t.letterTotal);
	};


//######################## WHEN TEXT CONTENT CHANGES ########################

	$scope.$watch(function(){
		return $scope.t.textContent;
	}, function(oldVal, newVal) {
		if(oldVal !== newVal){
			$scope.t.finished = false;
			$scope.t.letterTotal = $scope.t.textContent.split('').length;
		}
	});

//######################## UPDATE PROGRESS BAR HELPER ########################

	var updateProgressBar = function(){
		var progress = $scope.completion();
		var incorrectPerc = $scope.calc.percentage($scope.t.incorrectKeystrokes, $scope.t.keystrokes);     //using keystroke total over mistake total
		$scope.t.incorrectPart = $scope.calc.incorrectPortion(incorrectPerc, progress);
		$scope.t.correctPart = $scope.calc.correctPortion($scope.t.incorrectPart, progress);
	};

//######################## FINISHED ########################

	$scope.$watch(function(){
		return $scope.t.letterCount.num;
	}, function(newVal, oldVal){

		//update progress
		$scope.t.progress = $scope.completion();

		//if counter exceeds amount of text content then typer is finished
		if(newVal > $scope.t.letterTotal-1 && newVal !== 0 && oldVal !==0) {
			$log.log('stopping timer, updating word count, finished!');

			//stop timer
			$scope.$broadcast('timer-stop');

			//final update of wpm
			$scope.updateWordCount();
			$scope.t.wpm = $scope.calc.wpm($scope.t.correctWords, $scope.t.time);

			//set typer as finished
			$scope.t.finished = true;

		}
	});

//######################## WHEN TOTAL KEYSTROKES CHANGE ########################

	$scope.$watch(function(){
		return $scope.t.keystrokes;
	}, function(newVal, oldVal){
		updateProgressBar();
	});

//######################## CAPTURE KEYPRESS ########################

	$scope.broadcastKeys = function(event) {
		console.log('key event is:', event);

		//restart with ctrl+n
//		if(event.ctrlKey === true && event.keyCode === 14) {
//			$window.location.reload();
//		}

		//when typer is running and there is no modal
		if(!$scope.t.modalOpened && !$scope.t.finished){
			event.preventDefault();
			$scope.$broadcast('typer-keypress', event);
		}

		//space to restart
		if(!$scope.t.modalOpened && $scope.t.finished && event.keyCode === 32) {
			$window.location.reload();
		}
	};


//######################## UPDATE WORD COUNT ########################

	$scope.updateWordCount = function() {
		console.log('update word count is firing!');
		if($scope.t.perfectFlag) {
			console.log('adding to correct words');
			$scope.t.correctWords++;
		} else {
			console.log('reset letter flag');
			//reset letter flag
			$scope.t.perfectFlag = true;
		}
	};



/*#############################################################
EVERY KEYPRESS
#############################################################*/
	$scope.$on('typer-keypress', function(event){
		//this hasn't been very reliable for me for some reason, better to use watchers?

	});


/*#############################################################
EVERY SECOND
#############################################################*/
	$scope.$on('timer-tick', function(){

		$scope.$apply(function(){
			//update the time in seconds
			$scope.t.time++;

			//update wpm
			$scope.t.wpm = $scope.calc.wpm($scope.t.correctWords, $scope.t.time);

		});

	});


})


/*#############################################################
STATISTICS CONTROLLER
#############################################################*/

.controller('StatsCtrl', function($scope, typerData) {
	$scope.t = typerData;

	$scope.startTimer = function() {
		$scope.$broadcast('timer-start');
		$scope.t.timerRunning = true;
	};

	$scope.stopTimer = function() {
		$scope.$broadcast('timer-stop');
		$scope.t.timerRunning = false;
	};


})

/*#############################################################
MODAL CONTROLLER
#############################################################*/

.controller('ModalCtrl', function($scope, $modal, $log, typerData) {
	$scope.t = typerData;

	$scope.open = function(size) {
//		$scope.$$prevSibling.stopTimer();

		var modalInstance = $modal.open({
			templateUrl: 'modal.html',
			controller : ModalInstanceCtrl,
			size       : size,
			backdrop   : 'static',
			keyboard : false,                   //disable esc key closing modal
			resolve    : {
				text: function() {
					return $scope.t.textContent;
				}
			}
		});

		modalInstance.opened.then(function(){
			$scope.t.modalOpened = true;
		});

		modalInstance.result.then(function(newTextContent) {
			$scope.t.textContent = refactorTxt(newTextContent, $scope.t.letterLimit);
			$scope.$$prevSibling.startTimer();
			$scope.t.modalOpened = false;
		}, function() {
			$log.info('Modal dismissed at: ' + new Date());
		});
	};

	// Please note that $modalInstance represents a modal window (instance) dependency.
	// It is not the same as the $modal service used above.

	function ModalInstanceCtrl($scope, $modalInstance, $log, text) {

		$scope.txt = text;

		$scope.ok = function(newTextContent) {
			$modalInstance.close(newTextContent);
		};

		$scope.cancel = function() {
			$modalInstance.dismiss('cancel');
		};
	}

	//autostart modal
	$scope.open();
});


/*#############################################################
HELPERS
#############################################################*/

function refactorTxt(txt, limit) {
	//change carriage returns to single space
	var txt = txt.replace(/\r\n?|\n/g, " ");
	//remove space in between
	txt = txt.replace(/(\s{2,})/g, ' ');
	//trim edges
	txt = txt.trim();
	//limit the amount of text
	if(limit) {
		txt = txt.substring(0, limit);
	}
	return txt;
}