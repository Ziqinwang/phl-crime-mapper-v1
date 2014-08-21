var gulp = require('gulp'),
	sass = require('gulp-sass');

gulp.task('sass', function() {
	gulp.src('app/styles/main.scss')
		.pipe(sass())
		.pipe(gulp.dest('app/styles'))
});





gulp.task('default', function() {
  // place code for your default task here
});

gulp.task('build', ['sass']);