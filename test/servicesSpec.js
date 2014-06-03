describe('Typer services', function(){

	beforeEach(function(){
		module('typer.services');
	});

	describe('typer logic service', function(){
		var typerLogic;

		beforeEach(function(){
			inject(function($injector){
				typerLogic = $injector.get('typerLogic');
			});

		});

		describe('percentage function', function(){
			var percentage;

			beforeEach(function(){
				percentage = typerLogic.percentage;
			});

			it('should give back a percentage value with two numbers', function(){
				var a = 20,
					b = 100;
				expect(percentage(a, b)).toBe(20);
			});

			it('should return 0 if either is a string', function(){
				var a = 'hello',
					b = 100;
				expect(percentage(a, b)).toBe(0);
				expect(percentage(b, a)).toBe(0);
			});

			it('should return 0 if either arg is NaN', function(){
				var a = 0,
					b = NaN;
				expect(percentage(a, b)).toBe(0);
				expect(percentage(b, a)).toBe(0);
			});

			it('should return 0 if either arg is null', function(){
				var a = null,
					b = 10;
				expect(percentage(a, b)).toBe(0);
				expect(percentage(b, a)).toBe(0);
			});

			it('should return an integer', function(){
				var a = 20.3,
					b=100;

				function isInt(n) {
					return n % 1 === 0;
				}

				expect(isInt(percentage(a, b))).toBe(true);
			})

		});

		describe('wpm function', function() {
			var wpm;

			beforeEach(function() {
				wpm = typerLogic.wpm;
			});

			it('wpm under 60 seconds', function() {
				var time = 45,
					words = 20;
				expect(wpm(words, time)).toBe(20);
			});

			it('wpm over 60 seconds', function() {
				var time = 120,
					words = 30;
				expect(wpm(words, time)).toBe(15);
			});

			it('should be 0 wpm when no words correct', function() {
				var time = 45,
					words = 0;
				expect(wpm(words, time)).toBe(0);
			});

			it('should be 0 when words and time is 0', function() {
				var time = 0,
					words = 0;
				expect(wpm(words, time)).toBe(0);
			});

		});


		describe('incorrectPortion function', function(){

			var incorrectPortion, percentage, completion;

			beforeEach(function(){
				incorrectPortion = typerLogic.incorrectPortion;
				percentage = 20;
				completion = 60;
			});

			it('should return an amount of completion', function(){
				expect(incorrectPortion(percentage, completion)).toBe(12);
			});

			it('return 0 when error percentage is 0', function(){
				percentage = 0;
				expect(incorrectPortion(percentage, completion)).toBe(0);
			});

			it('return 0 when completion is 0', function(){
				completion = 0;
				expect(incorrectPortion(percentage, completion)).toBe(0);
			});

			it('should return 0 when either is NaN', function(){
				expect(incorrectPortion(percentage, NaN)).toBe(0);
				expect(incorrectPortion(NaN, completion)).toBe(0);
			})

		});

		describe('correctPortion function', function(){

			var correctPortion, part, completion;

			beforeEach(function(){
				correctPortion = typerLogic.correctPortion;
				part = 20;
				completion = 60;
			});

			it('should equal 40', function(){
				expect(correctPortion(part, completion)).toBe(40);
			});

			it('should equal 0 if completion is NaN', function(){
				expect(correctPortion(part, NaN)).toBe(0);
			});

			it('should equal 60 if part is NaN', function(){
				expect(correctPortion(NaN, completion)).toBe(60);
			});

		})




	})

});