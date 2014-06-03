angular.module('typer-directives', [])

.directive('letter', function($log) {

	return {
		restrict: 'E',
		scope: {
			count : '=',                    //t.letter.num
			index : '=',                    //position in ng-repeat
			letter: '=',                    //the actual character eg. 'a'
			perfectFlag: '=',               //t.perfectFlag
			totalMistakes: '=',             //t.incorrectKeystrokes
			updateWordCount: '&',           //updateWordCount(),
			keystrokes: '='                 //total keystrokes
		},
		template: "<span ng-class=\"{\n\tactive : count === index,\n\tcursorMistake1 : mistakes === 1 && !done,\n\tcursorMistake2 : mistakes === 2 && !done,\n\tcursorMistake3 : (mistakes === 3 || mistakes === 4) && !done,\n\tcursorMistakeLast : mistakes > 4 && !done,\n\tmistake1 : mistakes === 1 && done,\n\tmistake2 : mistakes === 2 && done,\n\tmistake3 : mistakes === 3 && done,\n\tmistakeLast : mistakes > 3 && done,\n\tnotPerfect : !perfect && !done && mistakes > 0,\n\tperfect : perfect && done\n}\">{{letter}}</span>",
		link : function(scope, elem, attrs) {
			scope.done = false;
			scope.mistakes = 0;
			scope.perfect = true;
			scope.updateFlag = true; //used to only update word count once
			scope.$on('typer-keypress', function(event, args){
				if(scope.$parent.$index === scope.count) {

					//update total keystrokes
					scope.keystrokes++;

					$log.log('code entered is:', args.which);
					$log.log('current active letter is:', elem.text());

					var answer = elem.text().charCodeAt();
					$log.log('current active letter code is:', answer);

					//next letter
					var nextLetter = elem.next().text().charCodeAt();

					//broadcast if next letter is a space ' '
					if(nextLetter === 32 && scope.updateFlag){
						scope.updateWordCount();
						scope.updateFlag = false;
					}

					//check
					args.which === answer ? correct() : incorrect();

					function correct() {
						$log.log('correct answer!');
						scope.count++;
						scope.done = true;

					}
					function incorrect() {
						$log.log('incorrect...');
						scope.mistakes++;
						scope.totalMistakes++;
						scope.perfect = false;

						scope.perfectFlag = false;

						if(scope.mistakes > 4) {
							correct();
						}

					}
				}
			});
		}
	};

})


.directive('test', function(){
	return {
		restrict : 'E',
		template: '<button>test</button>',
		link: function(scope, elem) {
			elem.on('click', function(e){
				scope.$broadcast('timer-stop');
			})
		}
	}
});


//TODO: work out a way to not need to listen for 'typer-keypress' event on all letter directives?  hold in controller and then lookup directive via css?