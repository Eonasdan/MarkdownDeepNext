namespace MarkdownDeep
{
    internal class FootnoteReference
    {
        public FootnoteReference(int index, string id)
        {
            Index = index;
            ID = id;
        }
        public int Index;
        public string ID;
    }
}
