/* global MarkdownDeepEditor*/
var MarkdownDeepEditorUI = new function () {
    'use strict';
    // Helper function that returns the HTML content of the toolbar
    this.ToolbarHtml = function () {
        return '<ul class="mdd_buttons">\n' +
            '<li><i class="fa fa-undo mdd_undo" title="Undo (Ctrl+Z)"></i></li>\n' +
            '<li><i class="fa fa-repeat mdd_redo" title="Redo (Ctrl+Y)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="fa fa-header mdd_heading" title="Change Heading Style (Ctrl+H, or Ctrl+0 to Ctrl+6)"></i></li>\n' +
            '<li><i class="fa fa-code mdd_code" title="Preformatted Code (Ctrl+K or Tab/Shift+Tab on multiline selection)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="fa fa-bold mdd_bold" title="Bold (Ctrl+B)"></i></li>\n' +
            '<li><i class="fa fa-italic mdd_italic" title="Italic (Ctrl+I)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="fa fa-list-ul mdd_ullist" title="Bullets (Ctrl+U)"></i></li>\n' +
            '<li><i class="fa fa-list-o mdd_ollist" title="Numbering (Ctrl+O)"></i></li>\n' +
            '<li><i class="fa fa-outdent mdd_outdent" title="Unquote (Ctrl+W)"></i></li>\n' +
            '<li><i class="fa fa-indent mdd_indent" title="Quote (Ctrl+Q)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="fa fa-link mdd_link" title="Insert Hyperlink (Ctrl+L)"></i></li>\n' +
            '<li><i class="fa fa-picture-o mdd_img" title="Insert Image (Ctrl+G)"></i></li>\n' +
            '<li><i class="fa fa-arrows-h mdd_hr" title="Insert Horizontal Rule (Ctrl+R)"></i></li>\n' +
            '<li><span class="mdd_sep"></span></li>\n' +
            '<li><i class="mdd_help fa fa-question"></i></li>\n' +
            '</ul>\n' +
            '<div style="clear:both"></div>\n';
    };
    // Toolbar click handler
    this.onToolbarButton = function (e) {
        // Find the editor, grab the MarkdownEditor.Editor class from it's data
        var command,
            editor = $(e.target)
                .closest('div.mdd_toolbar_wrap')
                .next('.mdd_editor_wrap')
                .children('textarea')
                .data('mdd');

        // Invoke the command
        //https://guides.github.com/features/mastering-markdown/
        command = $(e.target).attr('class').match(/mdd_[\w-]*\b/)[0].substr(4);
        if (command === 'help') {
            window.open('https://guides.github.com/features/mastering-markdown/', 'help');
            return false;
        }

        editor.InvokeCommand(command);

        return false;
    };
}();

(function ($) {
    'use strict';
    $.fn.MarkdownDeep = function (options) {
        // Default settings
        var settings =
        {
            toolbar: true,
            preview: true
        };

        // Apply options
        if (options) {
            $.extend(settings, options);
        }

        // Create each markdown editor
        return this.each(function (index) {
            // Check if our textarea is encased in a wrapper div
            var editorwrap = $(this).parent('.mdd_editor_wrap'), toolbarwrap, toolbar, preview = null, previewSelector, editor;
            if (editorwrap.length === 0) {
                editorwrap = $(this).wrap('<div class=\"mdd_editor_wrap\" />').parent();
            }

            // Create the toolbar
            if (settings.toolbar) {
                // Possible cases: 1) wrapper and toolbar exists, 2) only toolbar exists (no wrapper), 3) nothing exists
                toolbarwrap = editorwrap.prev('.mdd_toolbar_wrap');
                toolbar = editorwrap.prev('.mdd_toolbar');
                if (toolbarwrap.length === 0) {
                    // Does the toolbar exist?
                    if (toolbar.length === 0) {
                        toolbar = $('<div class="mdd_toolbar" />');
                        toolbar.insertBefore(editorwrap);
                    }
                    // Add our wrapper div (whether or not we created the toolbar or found it)
                    toolbar.wrap('<div class=\"mdd_toolbar_wrap\" />').parent();
                } else {
                    // wrapper was there, how about the toolbar?
                    if (toolbar.length === 0) {
                        // No toolbar div
                        toolbar = $('<div class="mdd_toolbar" />');
                        // Put the toolbar inside the provided wrapper div
                        toolbarwrap.html(toolbar);
                    }
                }
                // Stuff the toolbar with buttons!
                toolbar.append($(MarkdownDeepEditorUI.ToolbarHtml()));

                $('.mdd_buttons i', toolbar).click(MarkdownDeepEditorUI.onToolbarButton);
            }

            if (settings.preview === true) {
                // Work out the preview div, by:
                //      1. Look for a selector as a data attribute on the textarea
                //      2. If not present, assume <div class="mdd_preview">
                //      3. If not found, append a div with that class
                previewSelector = $(this).attr('data-mdd-preview');
                if (!previewSelector) {
                    previewSelector = '.mdd_preview';
                }
                preview = $(previewSelector)[index];
                if (!preview) {
                    $('<div class="mdd_preview"></div>').insertAfter(this);
                    preview = $('.mdd_preview')[index];
                }
            }

            // Create the editor helper
            editor = new MarkdownDeepEditor.Editor(this, preview);

            // Apply options to both the markdown component and the editor
            //  (Yes lazy but easier for client)
            if (options) {
                jQuery.extend(editor.Markdown, options);
                jQuery.extend(editor, options);
            }

            // Notify editor that options have changed
            editor.onOptionsChanged();

            // Attach the editor to the text area in case we want to get it back
            $(this).data('mdd', editor);
        });
    };
})(jQuery);
