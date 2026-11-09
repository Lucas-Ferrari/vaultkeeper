// Fixture: a skipped file. Its Create* calls must never be read.
public class ItemRules
{
    public void Initialize()
    {
        this.CreateWeapon(0, 7, 0, 0, 1, 2, true, LocalizedString.FromResource(() => ItemNames.Kris), 6);
    }
}
